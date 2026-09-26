import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { BasePayload } from "payload";
import type { TrustedDevice } from "@/payload-types";

/**
 * Работа с коллекцией `trusted-devices` — и НИЧЕГО больше.
 *
 * Модуль намеренно не знает ни про cookie, ни про `next/headers`: его
 * импортирует `lib/session.ts`, который, в свою очередь, тянет `proxy.ts`, а
 * тот исполняется на каждом запросе. Всё, что связано с cookie и подписью,
 * живёт в соседнем `trustedDevice.ts` — он импортирует этот файл, но не
 * наоборот. Та же причина, по которой разделены `review-eligibility.ts` и
 * `reviews.service.ts`: файл, попадающий в чужой граф импортов, обязан
 * оставаться узким.
 */

/**
 * Сколько живёт доверие к устройству.
 *
 * 90 суток — срок, после которого устройство обязано подтвердиться кодом
 * заново, даже если им всё это время пользовались. Он сильно больше срока
 * сессии (7 суток), иначе механизм не решал бы свою задачу, и при этом
 * конечен: бессрочное доверие означало бы, что украденный однажды браузерный
 * профиль открывает аккаунт навсегда.
 */
export const TRUSTED_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Окно, в течение которого прошлый секрет ещё принимается.
 *
 * Секрет обновляется на каждом использовании (см. trustedDevice.ts). Без
 * окна два почти одновременных запроса с одного устройства — открытые рядом
 * вкладки, повтор запроса при потере сети — приводили бы к тому, что второй
 * предъявляет уже заменённый секрет и устройство отзывалось бы как
 * скомпрометированное. Минуты достаточно для любой такой гонки и мало для
 * того, чтобы окном воспользовались.
 */
export const TRUSTED_DEVICE_ROTATION_GRACE_MS = 60 * 1000;

export type TrustedDeviceRevokeReason = NonNullable<
	TrustedDevice["revokedReason"]
>;

// ─── Секреты ────────────────────────────────────────────────────────────────

/** Новый секрет устройства: 32 случайных байта в base64url. */
export function generateDeviceSecret(): string {
	return randomBytes(32).toString("base64url");
}

/** Открытая часть cookie — по ней ищется запись. */
export function generateDeviceId(): string {
	return randomBytes(16).toString("hex");
}

/**
 * Хеш секрета. SHA-256 без соли — сознательно: секрет и так 256 бит
 * случайности, перебирать его нечем, а медленный KDF (bcrypt/argon2) стоил бы
 * сотни миллисекунд на КАЖДОМ входе, ничего не добавляя. Соль защищает от
 * радужных таблиц по угадываемым значениям; здесь угадывать нечего.
 */
export function hashDeviceSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}

/**
 * Сравнение хешей за постоянное время.
 *
 * Хеши не секретны, и утечка через тайминг здесь скорее теоретическая, но
 * сравнение секретных по смыслу значений обычным `===` — привычка, которая
 * однажды переносится туда, где она уже опасна.
 */
export function hashesEqual(a: string, b: string): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	const left = Buffer.from(a, "utf8");
	const right = Buffer.from(b, "utf8");
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}

// ─── Чтение ─────────────────────────────────────────────────────────────────

/** Идентификатор связи вне зависимости от глубины выборки. */
export function relationId(value: unknown): number | null {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value !== "") return Number(value);
	if (value && typeof value === "object" && "id" in value) {
		return Number((value as { id: unknown }).id);
	}
	return null;
}

/**
 * Запись устройства по открытому идентификатору из cookie.
 *
 * Возвращает и отозванные, и истёкшие записи: решение о пригодности
 * принимает вызывающий, и ему важно отличать «такого устройства нет вовсе»
 * от «устройство есть, но доверие снято» — второе стоит того, чтобы
 * почистить cookie.
 */
export async function findTrustedDeviceById(
	payload: BasePayload,
	deviceId: string,
): Promise<TrustedDevice | null> {
	const { docs } = await payload.find({
		collection: "trusted-devices",
		where: { deviceId: { equals: deviceId } },
		// depth: 0 — связь `user` нужна как id для сравнения владельца; с
		// populated-объектом сравнение всегда ложно (та же ловушка, что
		// описана в session.ts).
		depth: 0,
		limit: 1,
		overrideAccess: true,
	});

	return (docs[0] as TrustedDevice | undefined) ?? null;
}

/** Действующие доверенные устройства пользователя — для кабинета. */
export async function getUserTrustedDevices(
	payload: BasePayload,
	userId: string,
): Promise<TrustedDevice[]> {
	const { docs } = await payload.find({
		collection: "trusted-devices",
		where: {
			and: [
				{ user: { equals: userId } },
				{ revoked: { equals: false } },
				{ expiresAt: { greater_than: new Date().toISOString() } },
			],
		},
		sort: "-lastUsedAt",
		depth: 0,
		limit: 50,
		overrideAccess: true,
	});

	return docs as TrustedDevice[];
}

// ─── Запись ─────────────────────────────────────────────────────────────────

export interface CreateTrustedDeviceInput {
	userId: string;
	sessionId: string | null;
	deviceId: string;
	secret: string;
	deviceLabel: string;
	userAgent: string;
	fingerprint: string;
	ipPrefix: string | null;
	ip: string;
}

export async function createTrustedDevice(
	payload: BasePayload,
	input: CreateTrustedDeviceInput,
): Promise<TrustedDevice> {
	const now = new Date();

	const doc = await payload.create({
		collection: "trusted-devices",
		data: {
			user: Number(input.userId),
			session: input.sessionId ? Number(input.sessionId) : null,
			deviceId: input.deviceId,
			tokenHash: hashDeviceSecret(input.secret),
			previousTokenHash: null,
			rotatedAt: now.toISOString(),
			deviceLabel: input.deviceLabel,
			userAgent: input.userAgent,
			fingerprint: input.fingerprint,
			ipPrefix: input.ipPrefix,
			lastIp: input.ip,
			lastUsedAt: now.toISOString(),
			expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS).toISOString(),
			revoked: false,
		},
		overrideAccess: true,
	});

	return doc as TrustedDevice;
}

/**
 * Отмечает использование устройства и меняет секрет.
 *
 * Срок жизни при этом НЕ продлевается: 90 суток отсчитываются от выдачи
 * доверия, а не от последнего входа. Иначе устройство, которым пользуются
 * еженедельно, не подтверждалось бы кодом никогда.
 */
export async function rotateTrustedDevice(
	payload: BasePayload,
	device: TrustedDevice,
	input: {
		sessionId: string | null;
		secret: string;
		ip: string;
		ipPrefix: string | null;
		userAgent: string;
		deviceLabel: string;
	},
): Promise<void> {
	const now = new Date().toISOString();

	await payload.update({
		collection: "trusted-devices",
		id: device.id,
		data: {
			session: input.sessionId ? Number(input.sessionId) : null,
			tokenHash: hashDeviceSecret(input.secret),
			previousTokenHash: device.tokenHash,
			rotatedAt: now,
			lastUsedAt: now,
			lastIp: input.ip,
			ipPrefix: input.ipPrefix,
			userAgent: input.userAgent,
			deviceLabel: input.deviceLabel,
		},
		overrideAccess: true,
	});
}

/** Привязывает существующее устройство к новому входу, не трогая секрет. */
export async function touchTrustedDevice(
	payload: BasePayload,
	device: TrustedDevice,
	input: { sessionId: string | null; ip: string },
): Promise<void> {
	await payload.update({
		collection: "trusted-devices",
		id: device.id,
		data: {
			session: input.sessionId ? Number(input.sessionId) : null,
			lastUsedAt: new Date().toISOString(),
			lastIp: input.ip,
		},
		overrideAccess: true,
	});
}

export async function revokeTrustedDevice(
	payload: BasePayload,
	id: string | number,
	reason: TrustedDeviceRevokeReason,
): Promise<void> {
	await payload.update({
		collection: "trusted-devices",
		id,
		data: { revoked: true, revokedReason: reason },
		overrideAccess: true,
	});
}

/**
 * Снимает доверие со ВСЕХ устройств пользователя.
 *
 * Вызывается оттуда же, откуда отзываются все сессии (см. session.ts:
 * revokeAllUserSessions), и это не совпадение: смена пароля и «выйти со всех
 * устройств» означают «закрыть доступ везде». Оставить при этом устройство,
 * которое умеет входить без кода, значило бы не закрыть его.
 */
export async function revokeAllTrustedDevices(
	payload: BasePayload,
	userId: string,
	reason: TrustedDeviceRevokeReason,
): Promise<number> {
	const { docs } = await payload.find({
		collection: "trusted-devices",
		where: {
			and: [{ user: { equals: userId } }, { revoked: { equals: false } }],
		},
		depth: 0,
		limit: 100,
		overrideAccess: true,
	});

	await Promise.all(
		docs.map((doc) => revokeTrustedDevice(payload, doc.id, reason)),
	);

	return docs.length;
}
