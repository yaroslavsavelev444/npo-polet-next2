// ─── Profile domain types ─────────────────────────────────────────────────────
// Derived from payload-types.ts shapes. Extend as your schema evolves.

export interface ProfileUser {
	id: string;
	name: string;
	email: string;
	role: string;
	status: string;
	emailVerified?: boolean;
	lastLoginAt?: string;
}

export interface ProfileSession {
	id: string;
	deviceLabel: string;
	ip?: string;
	createdAt: string;
	lastActiveAt: string;
	isCurrent: boolean;
}

/**
 * Доверенное устройство в кабинете.
 *
 * Отдельный тип от ProfileSession, потому что это разные сущности с разным
 * сроком жизни: сессия — «где аккаунт открыт прямо сейчас», доверие — «какому
 * браузеру разрешено входить без кода». Разбор — в шапке коллекции
 * TrustedDevices.
 */
export interface ProfileTrustedDevice {
	/** Открытый идентификатор из cookie — им же устройство и отзывается. */
	deviceId: string;
	deviceLabel: string;
	lastIp?: string;
	lastUsedAt: string;
	expiresAt: string;
	/** Доверие выдано тому браузеру, из которого открыта эта страница. */
	isCurrent: boolean;
}

export interface ProfileConsent {
	id: string;
	consentSlug: string;
	version: string;
	acceptedAt: string;
}

// ─── Tab routing ──────────────────────────────────────────────────────────────

export type ProfileTab = "account" | "security" | "sessions";

// ─── Form state ───────────────────────────────────────────────────────────────

export interface ChangePasswordPayload {
	oldPassword: string;
	newPassword: string;
}

export interface UpdateAccountPayload {
	name: string;
}
