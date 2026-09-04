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

/**
 * Значения полей, которые Server Action возвращает форме обратно при ошибке.
 *
 * React после каждого form action сбрасывает неуправляемые поля к их
 * `defaultValue` (см. recursivelyResetForms в react-dom). Раньше это означало,
 * что при любой ошибке — «неверный пароль», rate limit, недоступность почты —
 * пользователь терял и email, и имя, и всё остальное, и заполнял форму
 * заново. Возвращая безопасные значения сюда и подставляя их в `defaultValue`,
 * мы получаем ровно нужное поведение: сброс применяется к НОВЫМ значениям по
 * умолчанию, то есть введённые данные остаются на месте.
 *
 * Пароли сюда не попадают НИКОГДА: они не должны ни ходить по сети обратно,
 * ни оседать в React-состоянии/RSC-пейлоаде. Поле пароля обязано очищаться —
 * это ожидаемое поведение форм входа.
 */
export type AuthFormValues = Partial<Record<"email" | "name", string>>;

export type ActionResult<T = void> =
	| { success: true; data: T }
	| {
			success: false;
			error: string;
			fieldErrors?: Record<string, string[]>;
			code?: AuthErrorCode;
			/** Безопасные значения полей для восстановления формы (без паролей). */
			values?: AuthFormValues;
	  };

export interface RegisterResult {
	requiresOtp: boolean;
	/**
	 * Email, на который ушёл код. Возвращается сервером, а не берётся из
	 * состояния формы: React сбрасывает поля после form action, и опираться на
	 * клиентское зеркало значения на шаге перехода к вводу OTP ненадёжно.
	 */
	email: string;
}

export interface LoginResult {
	requiresOtp: boolean;
	/** Куда ушёл код — форма OTP показывает его в маскированном виде. */
	email: string;
}

// OtpVerifyResult больше нет: verifyOtpAction при успехе не возвращает данные,
// а делает redirect() на сервере (см. verifyOtp.ts) — возвращаемое значение
// у него бывает только ошибкой.
