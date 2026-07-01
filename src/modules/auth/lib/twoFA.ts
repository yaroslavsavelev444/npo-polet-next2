// src/modules/auth/lib/twoFA.ts
const TWO_FA_TTL_MS = 24 * 60 * 60 * 1000

export function isTwoFAVerified(user: { twoFAVerified?: boolean | null; twoFAVerifiedAt?: string | null }): boolean {
  if (user.twoFAVerified !== true) return false
  if (!user.twoFAVerifiedAt) return false
  const verifiedAt = new Date(user.twoFAVerifiedAt).getTime()
  return Date.now() - verifiedAt < TWO_FA_TTL_MS
}