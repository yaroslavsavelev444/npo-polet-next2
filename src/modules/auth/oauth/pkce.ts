import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * PKCE (RFC 7636, метод S256) и одноразовые значения потока OAuth.
 *
 * PKCE здесь не вместо client_secret, а вместе с ним: секрет доказывает
 * Яндексу, что код меняет наш сервер, а verifier — что код меняет тот же
 * поток, который его запросил. Перехваченный по дороге код (журнал прокси,
 * Referer, расширение браузера) без verifier бесполезен.
 */

/** 32 случайных байта → 43 символа base64url: минимум RFC 7636 и с запасом. */
export function createCodeVerifier(): string {
	return randomBytes(32).toString("base64url");
}

export function codeChallengeFor(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

/** Непредсказуемое значение для state и идентификатора потока. */
export function createOpaqueId(): string {
	return randomBytes(32).toString("base64url");
}

/** Сравнение state за постоянное время — без утечки совпавшего префикса. */
export function sameOpaqueValue(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
}
