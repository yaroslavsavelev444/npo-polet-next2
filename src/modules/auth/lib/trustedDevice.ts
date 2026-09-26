import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { BasePayload } from "payload";
import type { TrustedDevice } from "@/payload-types";
import { deviceFingerprint, networkPrefix } from "./network";
import { parseDeviceLabel } from "./session";
import {
	createTrustedDevice,
	findTrustedDeviceById,
	generateDeviceId,
	generateDeviceSecret,
	hashDeviceSecret,
	hashesEqual,
	relationId,
	revokeAllTrustedDevices,
	revokeTrustedDevice,
	rotateTrustedDevice,
	TRUSTED_DEVICE_TTL_MS,
} from "./trustedDevice.db";
import { decideTrust, type TrustDenialReason } from "./trustedDevice.policy";

export type { TrustDenialReason } from "./trustedDevice.policy";

/**
 * Доверенное устройство: браузер, которому разрешено входить без OTP.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ИМЕННО ОСЛАБЛЯЕТСЯ, А ЧТО НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Второй фактор не отменяется — он ПЕРЕНОСИТСЯ С ВХОДА НА УСТРОЙСТВО. Раньше
 * знание пароля плюс доступ к почте открывали аккаунт откуда угодно; теперь
 * знание пароля плюс НЕИЗВЛЕКАЕМАЯ ИЗ БРАУЗЕРА cookie (httpOnly, SameSite
 * Strict) открывают его только с того браузера, той сети и того аккаунта,
 * которым доверие выдавалось. Всё остальное по-прежнему требует кода:
 *
 *   • другой браузер или другой тип устройства  → «новое устройство»
 *   • другая подсеть                            → см. lib/network.ts
 *   • после смены пароля                        → доверие снимается целиком
 *   • вход сотрудника (role ≠ user)             → доверие не выдаётся вовсе
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ФОРМАТ COOKIE
 * ────────────────────────────────────────────────────────────────────────────
 *     v1.<deviceId>.<secret>.<подпись>
 *
 *   deviceId  — открытый ключ поиска записи, сам по себе прав не даёт;
 *   secret    — 256 бит случайности; в базе лежит только его SHA-256;
 *   подпись   — HMAC-SHA256 на ключе, выведенном из PAYLOAD_SECRET.
 *
 * Подпись и хеш в базе решают РАЗНЫЕ задачи, поэтому есть оба. Подпись
 * отсекает подделанные и повреждённые значения до обращения к базе — то есть
 * не даёт перебирать deviceId и не пускает мусор в запросы. Хеш защищает на
 * случай утечки дампа: из него не восстановить значение, которое нужно
 * предъявить.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * РОТАЦИЯ И ОБНАРУЖЕНИЕ КРАЖИ
 * ────────────────────────────────────────────────────────────────────────────
 * Секрет меняется при каждом использовании, прошлый принимается ещё минуту
 * (гонка двух вкладок). Предъявленный секрет с ВЕРНОЙ подписью, но не
 * совпадающий ни с текущим, ни с прошлым, означает ровно одно: у кого-то была
 * копия cookie, и её уже успели обновить — либо у законного владельца, либо у
 * того, кто её скопировал. Различить эти случаи нельзя, поэтому доверие
 * снимается со всех устройств пользователя, и следующий вход потребует кода.
 * Это тот же приём, которым защищают refresh-токены, и та же причина: молча
 * продолжить работу здесь означало бы оставить украденную копию рабочей.
 *
 * Сессии при этом НЕ отзываются. Ложное срабатывание возможно (восстановленный
 * из бэкапа профиль браузера, откат снапшота), и выкидывать человека со всех
 * устройств из-за него — несоразмерно: потеря доверия заставит его ввести код,
 * чего для проверки личности достаточно.
 */

/**
 * SameSite=Strict, а не Lax, как у payload-token.
 *
 * Cookie читается ровно в одном месте — Server Action входа, то есть POST с
 * нашего же происхождения. Strict ничего здесь не ломает (на переход по
 * внешней ссылке cookie не отправится, но при рендере страниц она и не
 * нужна) и снимает целый класс сценариев, в которых чужой сайт инициирует
 * запрос к нам с этой cookie.
 */
export const TRUSTED_DEVICE_COOKIE = "trusted-device";

const COOKIE_VERSION = "v1";

/**
 * Ключ подписи выводится из PAYLOAD_SECRET, а не заводится отдельной
 * переменной окружения: новая обязательная переменная означает, что выкладка
 * без неё падает, а забытая — что подпись считается на пустой строке.
 * Разделение назначений обеспечивает метка в HMAC — тот же приём, что у HKDF
 * с `info`.
 */
function signingKey(): Buffer {
	const secret = process.env.PAYLOAD_SECRET;
	if (!secret) {
		throw new Error("PAYLOAD_SECRET is required to sign trusted-device tokens");
	}
	return createHmac("sha256", secret).update("trusted-device/v1").digest();
}

function sign(payload: string): string {
	return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

function signatureValid(payload: string, signature: string): boolean {
	const expected = Buffer.from(sign(payload), "utf8");
	const actual = Buffer.from(signature, "utf8");
	if (expected.length !== actual.length) return false;
	return timingSafeEqual(expected, actual);
}

interface ParsedCookie {
	deviceId: string;
	secret: string;
}

function buildCookieValue(deviceId: string, secret: string): string {
	const payload = `${COOKIE_VERSION}.${deviceId}.${secret}`;
	return `${payload}.${sign(payload)}`;
}

function parseCookieValue(raw: string | undefined): ParsedCookie | null {
	if (!raw) return null;

	const parts = raw.split(".");
	if (parts.length !== 4) return null;

	const [version, deviceId, secret, signature] = parts;
	if (version !== COOKIE_VERSION) return null;
	if (!/^[0-9a-f]{32}$/.test(deviceId)) return null;
	if (!/^[A-Za-z0-9_-]{16,}$/.test(secret)) return null;

	if (!signatureValid(`${version}.${deviceId}.${secret}`, signature))
		return null;

	return { deviceId, secret };
}

// ─── Cookie ─────────────────────────────────────────────────────────────────

async function writeCookie(deviceId: string, secret: string): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set(TRUSTED_DEVICE_COOKIE, buildCookieValue(deviceId, secret), {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict",
		path: "/",
		maxAge: Math.floor(TRUSTED_DEVICE_TTL_MS / 1000),
	});
}

export async function clearTrustedDeviceCookie(): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.delete(TRUSTED_DEVICE_COOKIE);
}

/** Есть ли у этого браузера cookie доверия — без обращения к базе. */
export async function readTrustedDeviceCookie(): Promise<ParsedCookie | null> {
	const cookieStore = await cookies();
	return parseCookieValue(cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value);
}

// ─── Проверка ───────────────────────────────────────────────────────────────

export type TrustedDeviceDecision =
	| { trusted: true; device: TrustedDevice }
	| { trusted: false; reason: TrustDenialReason };

export interface EvaluateTrustedDeviceInput {
	payload: BasePayload;
	userId: string;
	/** Роль покупателя из БД: сотрудникам доверие не выдаётся и не признаётся. */
	role: string | null | undefined;
	ip: string;
	userAgent: string;
}

/**
 * Можно ли пропустить OTP для этого входа.
 *
 * Вызывается ПОСЛЕ проверки пароля и до создания челленджа. Сама функция
 * НИЧЕГО не решает: правило целиком живёт в чистой decideTrust
 * (trustedDevice.policy.ts), здесь только чтение cookie и записи, да
 * исполнение того, что правило предписало, — удалить мёртвую cookie и снять
 * доверие при подозрении на кражу. Откладывать последнее до конца входа
 * нельзя, поэтому это единственная запись, которую проверка себе позволяет.
 */
export async function evaluateTrustedDevice({
	payload,
	userId,
	role,
	ip,
	userAgent,
}: EvaluateTrustedDeviceInput): Promise<TrustedDeviceDecision> {
	// Сотрудник (role ≠ user) проходит второй фактор всегда: у его аккаунта
	// есть доступ к чужим заказам и персональным данным, и цена ошибки здесь
	// несопоставима с удобством. Проверка стоит до чтения cookie — у записи
	// сотрудника её и не должно существовать (issueTrustedDevice отказывает по
	// тому же признаку), но правило не должно зависеть от того, что где-то
	// раньше всё сработало верно.
	if (role !== "user") {
		return { trusted: false, reason: "staff_account" };
	}

	const cookie = await readTrustedDeviceCookie();
	if (!cookie) return { trusted: false, reason: "no_cookie" };

	const device = await findTrustedDeviceById(payload, cookie.deviceId);
	if (!device) {
		// Cookie подписана нами, но записи нет: устройство удалили из базы или
		// cookie пережила пересоздание базы. Чистим — иначе она будет
		// предъявляться при каждом входе до конца своего срока.
		await clearTrustedDeviceCookie();
		return { trusted: false, reason: "unknown_device" };
	}

	const verdict = decideTrust(
		{
			userId: String(relationId(device.user)),
			tokenHash: device.tokenHash,
			previousTokenHash: device.previousTokenHash ?? null,
			rotatedAt: device.rotatedAt ?? null,
			fingerprint: device.fingerprint,
			ipPrefix: device.ipPrefix ?? null,
			expiresAt: device.expiresAt,
			revoked: Boolean(device.revoked),
		},
		{
			userId,
			presentedTokenHash: hashDeviceSecret(cookie.secret),
			ip,
			userAgent,
			deviceLabel: parseDeviceLabel(userAgent),
		},
	);

	if (verdict.trusted) return { trusted: true, device };

	if (verdict.revokeAll) {
		await revokeAllTrustedDevices(payload, userId, "reuse");
	}
	if (verdict.dropCookie) {
		await clearTrustedDeviceCookie();
	}

	return { trusted: false, reason: verdict.reason };
}

// ─── Выдача и продление ─────────────────────────────────────────────────────

export interface IssueTrustedDeviceInput {
	payload: BasePayload;
	userId: string;
	/** Сессия только что завершённого входа — к ней привязывается доверие. */
	sessionId: string | null;
	role: string | null | undefined;
	ip: string;
	userAgent: string;
}

/**
 * Выдаёт или обновляет доверие после успешного подтверждения кодом.
 *
 * Вызывается только из verifyOtpAction: единственное основание доверять
 * устройству — что с него только что подтвердили владение почтой.
 *
 * Возвращает `true`, если устройство стало доверенным впервые, — вызывающий
 * по этому признаку решает, сообщать ли об этом пользователю: «код больше не
 * спросят» — событие, о котором он обязан узнать, а продление доверия
 * знакомому браузеру событием не является.
 *
 * Неудача здесь НЕ отменяет вход: доверие — это удобство следующего раза, а
 * вход уже состоялся. Поэтому вызывающий оборачивает вызов в catch.
 */
export async function issueTrustedDevice({
	payload,
	userId,
	sessionId,
	role,
	ip,
	userAgent,
}: IssueTrustedDeviceInput): Promise<{ issued: boolean; isNew: boolean }> {
	if (role !== "user") return { issued: false, isNew: false };

	const label = parseDeviceLabel(userAgent);
	const fingerprint = deviceFingerprint(label, userAgent);
	const ipPrefix = networkPrefix(ip);

	// Без опознанной сети доверие не выдаём: признак «та же подсеть» тогда
	// нечем будет проверить, и устройство всё равно не прошло бы проверку при
	// следующем входе — то есть запись завелась бы мёртвой.
	if (ipPrefix === null) return { issued: false, isNew: false };

	const secret = generateDeviceSecret();
	const cookie = await readTrustedDeviceCookie();

	if (cookie) {
		const existing = await findTrustedDeviceById(payload, cookie.deviceId);
		const reusable =
			existing &&
			!existing.revoked &&
			new Date(existing.expiresAt) > new Date() &&
			String(relationId(existing.user)) === String(userId);

		if (reusable && existing) {
			// Тот же браузер, тот же аккаунт — это продление, а не новое
			// устройство: строка обновляется на месте. Иначе смена сети раз в
			// неделю плодила бы по записи на каждый переезд, и список в
			// кабинете переставал бы быть читаемым.
			await rotateTrustedDevice(payload, existing, {
				sessionId,
				secret,
				ip,
				ipPrefix,
				userAgent,
				deviceLabel: label,
			});
			await writeCookie(existing.deviceId, secret);
			return { issued: true, isNew: false };
		}
	}

	const deviceId = generateDeviceId();
	await createTrustedDevice(payload, {
		userId,
		sessionId,
		deviceId,
		secret,
		deviceLabel: label,
		userAgent,
		fingerprint,
		ipPrefix,
		ip,
	});
	await writeCookie(deviceId, secret);

	return { issued: true, isNew: true };
}

/**
 * Подтверждает использование доверия: привязывает запись к новой сессии и
 * меняет секрет.
 *
 * Отдельным шагом после входа, а не внутри evaluateTrustedDevice, потому что
 * на момент проверки сессии ещё не существует — она создаётся уже решением,
 * которое эта проверка и принимает. Ротация до завершения входа означала бы,
 * что сбой на следующем шаге оставляет у браузера cookie с секретом, который
 * в базе уже заменён, — то есть при следующей попытке сработала бы защита от
 * повторного использования и человек потерял бы доверие ни за что.
 */
export async function confirmTrustedDeviceUse({
	payload,
	device,
	sessionId,
	ip,
	userAgent,
}: {
	payload: BasePayload;
	device: TrustedDevice;
	sessionId: string | null;
	ip: string;
	userAgent: string;
}): Promise<void> {
	const secret = generateDeviceSecret();

	await rotateTrustedDevice(payload, device, {
		sessionId,
		secret,
		ip,
		ipPrefix: networkPrefix(ip),
		userAgent,
		deviceLabel: parseDeviceLabel(userAgent),
	});

	await writeCookie(device.deviceId, secret);
}

/**
 * Снимает доверие с одного устройства по требованию владельца.
 *
 * Если это то устройство, с которого пришёл запрос, — cookie тоже удаляется:
 * оставлять её значило бы при следующем входе получить «повторное
 * использование секрета» и отзыв ВСЕХ устройств вместо одного.
 */
export async function revokeOwnTrustedDevice(
	payload: BasePayload,
	userId: string,
	deviceId: string,
): Promise<boolean> {
	const device = await findTrustedDeviceById(payload, deviceId);
	if (!device) return false;
	if (String(relationId(device.user)) !== String(userId)) return false;

	await revokeTrustedDevice(payload, device.id, "user");

	const cookie = await readTrustedDeviceCookie();
	if (cookie?.deviceId === deviceId) {
		await clearTrustedDeviceCookie();
	}

	return true;
}

/** Снимает доверие со всех устройств владельца по требованию из кабинета. */
export async function revokeAllOwnTrustedDevices(
	payload: BasePayload,
	userId: string,
): Promise<number> {
	const count = await revokeAllTrustedDevices(payload, userId, "user");
	await clearTrustedDeviceCookie();
	return count;
}
