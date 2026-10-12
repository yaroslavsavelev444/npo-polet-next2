import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Шифрование переписки поддержки.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОТ ЧЕГО ЗАЩИЩАЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Текст сообщений, контекст, оценка с комментарием, имена и содержимое файлов
 * лежат в базе и на диске только зашифрованными. Утёкший дамп базы, бэкап,
 * снимок диска хостинга, SQL-инъекция в другой части сайта, доступ к
 * Postgres без доступа к приложению — во всех этих случаях переписку
 * прочитать нельзя: ключа в базе нет.
 *
 * От чего НЕ защищает: от взлома самого приложения (процесс с ключом в
 * памяти и доступом к базе читает всё, что читает менеджер). Сквозное
 * шифрование «только у клиента» здесь невозможно в принципе: переписку
 * читают несколько менеджеров, а сервер раздаёт её и подбирает заготовки.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * УСТРОЙСТВО: КОНВЕРТНОЕ ШИФРОВАНИЕ
 * ────────────────────────────────────────────────────────────────────────────
 *  • Мастер-ключ (KEK) — ТОЛЬКО в переменной окружения
 *    SUPPORT_ENCRYPTION_KEYS, вне базы и вне её бэкапов.
 *  • У каждого диалога и каждого вложения — свой случайный ключ данных (DEK).
 *    В базе он хранится зашифрованным мастер-ключом («обёрнутым»).
 *  • Данные шифруются ключом данных: AES-256-GCM, случайный 96-битный IV на
 *    каждую запись, тег подлинности 128 бит.
 *
 * Зачем два уровня: смена мастер-ключа — это переобёртка нескольких тысяч
 * коротких ключей (scripts/support-rotate-keys.ts), а не перешифровка всей
 * переписки и всех файлов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПРИВЯЗКА К МЕСТУ (AAD)
 * ────────────────────────────────────────────────────────────────────────────
 * Каждый шифртекст аутентифицирует, ГДЕ он лежит: сообщение — диалог, номер,
 * вид и автора. Переставленный в другой диалог шифртекст или заметка, у
 * которой в базе подменили kind на text, чтобы показать её покупателю, не
 * расшифруются — GCM отвергнет тег.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ФОРМАТЫ
 * ────────────────────────────────────────────────────────────────────────────
 *  SUPPORT_ENCRYPTION_KEYS = "<id>:<base64 32 байта>[,<id>:<base64>…]"
 *    первый — действующий, остальные — прежние (только для расшифровки).
 *  Обёрнутый ключ:  "<id мастер-ключа>.<base64url(iv | ключ | тег)>"
 *  Шифртекст:       "e1.<base64url(iv | данные | тег)>" (строки в базе)
 *  Файл на диске:   iv | данные | тег (сырые байты)
 *
 * ⚠ Потеря мастер-ключа = потеря всей переписки. Ключ хранится отдельно от
 * бэкапов базы (иначе шифрование бессмысленно) и сам резервируется офлайн.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const CIPHERTEXT_PREFIX = "e1.";
const DEK_AAD = "support-chat:dek:v1";

export class SupportCryptoError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SupportCryptoError";
	}
}

interface Keyring {
	activeId: string;
	keys: Map<string, Buffer>;
}

let keyring: Keyring | null = null;
let keyringSource: string | undefined;

export function parseKeyring(raw: string): Keyring {
	const keys = new Map<string, Buffer>();
	let activeId: string | null = null;

	for (const entry of raw
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)) {
		const separator = entry.indexOf(":");
		const id = entry.slice(0, separator);
		const material = entry.slice(separator + 1);
		if (separator <= 0 || !/^[A-Za-z0-9_-]{1,16}$/.test(id)) {
			throw new SupportCryptoError(
				"SUPPORT_ENCRYPTION_KEYS: ожидается «id:base64», id — до 16 латинских букв и цифр",
			);
		}
		const key = Buffer.from(material, "base64");
		if (key.length !== KEY_BYTES) {
			throw new SupportCryptoError(
				`SUPPORT_ENCRYPTION_KEYS: ключ «${id}» должен быть 32 байта в base64 (openssl rand -base64 32)`,
			);
		}
		if (keys.has(id)) {
			throw new SupportCryptoError(
				`SUPPORT_ENCRYPTION_KEYS: ключ «${id}» указан дважды`,
			);
		}
		keys.set(id, key);
		activeId ??= id;
	}

	if (!activeId) {
		throw new SupportCryptoError("SUPPORT_ENCRYPTION_KEYS пуст");
	}
	return { activeId, keys };
}

/**
 * Связка ключей из окружения. Читается лениво: модуль попадает в граф
 * импорта коллекций, который грузят и CLI Payload, и сборка, — им ключ не
 * нужен, и требовать его там значило бы ломать миграции.
 */
function getKeyring(): Keyring {
	const raw = process.env.SUPPORT_ENCRYPTION_KEYS;
	if (keyring && raw === keyringSource) return keyring;
	if (!raw) {
		throw new SupportCryptoError(
			"SUPPORT_ENCRYPTION_KEYS не задан — без ключа переписку поддержки нельзя ни записать, ни прочитать",
		);
	}
	keyring = parseKeyring(raw);
	keyringSource = raw;
	unwrapCache.clear();
	return keyring;
}

/** Проверить ключи при старте процесса, а не на первом сообщении. */
export function assertEncryptionConfigured(): void {
	getKeyring();
}

// ─── Низкий уровень ─────────────────────────────────────────────────────────

function seal(key: Buffer, plaintext: Buffer, aad: string): Buffer {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv, {
		authTagLength: TAG_BYTES,
	});
	cipher.setAAD(Buffer.from(aad, "utf8"));
	const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

function open(key: Buffer, sealed: Buffer, aad: string): Buffer {
	if (sealed.length < IV_BYTES + TAG_BYTES) {
		throw new SupportCryptoError("Шифртекст повреждён");
	}
	const iv = sealed.subarray(0, IV_BYTES);
	const tag = sealed.subarray(sealed.length - TAG_BYTES);
	const body = sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES);
	const decipher = createDecipheriv(ALGORITHM, key, iv, {
		authTagLength: TAG_BYTES,
	});
	decipher.setAAD(Buffer.from(aad, "utf8"));
	decipher.setAuthTag(tag);
	try {
		return Buffer.concat([decipher.update(body), decipher.final()]);
	} catch {
		// Неверный ключ, подмена данных или чужое место (AAD) — снаружи
		// неразличимо, и различать незачем.
		throw new SupportCryptoError(
			"Не удалось расшифровать: данные повреждены или подменены",
		);
	}
}

// ─── Ключи данных ───────────────────────────────────────────────────────────

/**
 * Расшифрованные ключи данных — в памяти процесса, чтобы не разворачивать
 * ключ диалога на каждое сообщение. Ограничен по размеру; ключ — по
 * обёрнутому значению, так что переобёрнутый ключ просто займёт новую запись.
 */
const UNWRAP_CACHE_LIMIT = 5_000;
const unwrapCache = new Map<string, Buffer>();

export interface DataKey {
	key: Buffer;
	wrapped: string;
}

export function generateDataKey(): DataKey {
	const key = randomBytes(KEY_BYTES);
	return { key, wrapped: wrapDataKey(key) };
}

export function wrapDataKey(key: Buffer): string {
	const ring = getKeyring();
	const kek = ring.keys.get(ring.activeId) as Buffer;
	return `${ring.activeId}.${seal(kek, key, DEK_AAD).toString("base64url")}`;
}

export function unwrapDataKey(wrapped: string): Buffer {
	// Связка — до кэша: если мастер-ключ убрали из окружения, развёрнутые
	// им ключи не должны продолжать работать из памяти (getKeyring при смене
	// связки кэш очищает).
	const ring = getKeyring();
	const cached = unwrapCache.get(wrapped);
	if (cached) return cached;

	const separator = wrapped.indexOf(".");
	const kek =
		separator > 0 ? ring.keys.get(wrapped.slice(0, separator)) : undefined;
	if (!kek) {
		throw new SupportCryptoError(
			`Ключ «${wrapped.slice(0, Math.max(separator, 0))}» отсутствует в SUPPORT_ENCRYPTION_KEYS`,
		);
	}
	const key = open(
		kek,
		Buffer.from(wrapped.slice(separator + 1), "base64url"),
		DEK_AAD,
	);

	if (unwrapCache.size >= UNWRAP_CACHE_LIMIT) {
		const oldest = unwrapCache.keys().next().value;
		if (oldest !== undefined) unwrapCache.delete(oldest);
	}
	unwrapCache.set(wrapped, key);
	return key;
}

/** Обёрнут не действующим мастер-ключом — кандидат на переобёртку. */
export function isWrappedWithStaleKey(wrapped: string): boolean {
	return !wrapped.startsWith(`${getKeyring().activeId}.`);
}

// ─── Данные ─────────────────────────────────────────────────────────────────

export function encryptText(
	key: Buffer,
	plaintext: string,
	aad: string,
): string {
	return (
		CIPHERTEXT_PREFIX +
		seal(key, Buffer.from(plaintext, "utf8"), aad).toString("base64url")
	);
}

export function decryptText(
	key: Buffer,
	ciphertext: string,
	aad: string,
): string {
	if (!ciphertext.startsWith(CIPHERTEXT_PREFIX)) {
		throw new SupportCryptoError("Неизвестный формат шифртекста");
	}
	const sealed = Buffer.from(
		ciphertext.slice(CIPHERTEXT_PREFIX.length),
		"base64url",
	);
	return open(key, sealed, aad).toString("utf8");
}

export function encryptBytes(
	key: Buffer,
	plaintext: Buffer,
	aad: string,
): Buffer {
	return seal(key, plaintext, aad);
}

export function decryptBytes(key: Buffer, sealed: Buffer, aad: string): Buffer {
	return open(key, sealed, aad);
}

// ─── Места (AAD) ────────────────────────────────────────────────────────────

export const aad = {
	message: (m: {
		conversationId: number;
		seq: number;
		kind: string;
		authorType: string;
	}) =>
		`support-chat:msg:v1:${m.conversationId}:${m.seq}:${m.kind}:${m.authorType}`,
	csat: (conversationId: number) => `support-chat:csat:v1:${conversationId}`,
	attachmentName: (storageKey: string) =>
		`support-chat:att-name:v1:${storageKey}`,
	attachmentFile: (storageKey: string, variant: "original" | "thumbnail") =>
		`support-chat:att-file:v1:${storageKey}:${variant}`,
} as const;
