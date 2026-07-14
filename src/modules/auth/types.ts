// ─── Auth Types ───────────────────────────────────────────────────────────────

export type UserRole = "user" | "admin" | "superadmin";
export type UserStatus = "active" | "blocked" | "suspended";
export type OtpType = "email_verify" | "login_2fa";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  twoFAVerified: boolean;
  twoFAVerifiedAt: string | null;
  emailVerified: boolean;
  lastLoginAt: string | null;
}

export interface Session {
  id: string;
  userId: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface AcceptedConsent {
  slug: string;

  version: string;

  consentId: number;
}
export interface ConsentListItem {
  id: number; // идентификатор (может быть number или string)
  slug: string; // уникальный слаг
  title: string; // отображаемое название
  version: string; // версия документа
  isRequired: boolean; // обязательно ли к принятию
  documentUrl: string | null; // ссылка на внешний документ (если есть)
}

// ─── Action Results ───────────────────────────────────────────────────────────

/**
 * Категория ошибки регистрации/логина — UI (см. AuthAlert.tsx) использует её,
 * чтобы показывать разное оформление и, где уместно, разный текст, не
 * дублируя классификацию из errorHandling.ts на клиенте.
 */
export type AuthErrorCode =
  | "validation"
  | "invalid_credentials"
  | "account_locked"
  | "account_blocked"
  | "account_suspended"
  | "email_taken"
  | "rate_limited"
  | "server_error";

export type ActionResult<T = void> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      code?: AuthErrorCode;
    };

export interface RegisterResult {
  requiresOtp: boolean;
}

export interface LoginResult {
  requiresOtp: boolean;
}

export interface OtpVerifyResult {
  redirectTo: string;
}
