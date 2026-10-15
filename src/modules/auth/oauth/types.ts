/**
 * Сервисы входа. Сейчас один; значение совпадает с options поля `provider`
 * коллекции user-identities.
 */
export type OAuthProviderId = "yandex";

/** Привязка, которая создаётся после подтверждения почты кодом (verifyOtp.ts). */
export interface PendingOAuthLink {
	provider: OAuthProviderId;
	subject: string;
	/** Почта сервиса — снимок для user-identities.emailAtLink. */
	email: string;
}

/**
 * Коды ошибок в `?oauth_error=` на /auth/login (тексты — в components/OAuthError).
 * Не содержат данных и безопасны в адресной строке.
 */
export type OAuthErrorCode =
	| "cancelled"
	| "expired"
	| "unavailable"
	| "no_email"
	| "account_blocked"
	| "account_suspended"
	| "already_linked_elsewhere"
	| "rate_limited"
	| "generic";
