// ─── Auth Types ───────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'admin' | 'superadmin'
export type UserStatus = 'active' | 'blocked' | 'suspended'
export type OtpType = 'email_verify' | 'login_2fa'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  twoFAVerified: boolean
  twoFAVerifiedAt: string | null
  emailVerified: boolean
  lastLoginAt: string | null
}

export interface Session {
  id: string
  userId: string
  userAgent: string
  ip: string
  createdAt: string
  lastActiveAt: string
  expiresAt: string
}

export interface AcceptedConsent {
  slug: string
  version: string
  consentId: string
}

// ─── Action Results ───────────────────────────────────────────────────────────

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

export interface RegisterResult {
  requiresOtp: boolean
}

export interface LoginResult {
  requiresOtp: boolean
}

export interface OtpVerifyResult {
  redirectTo: string
}