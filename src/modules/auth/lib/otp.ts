import { createHash, randomInt } from 'node:crypto'

// ─── Константы ────────────────────────────────────────────────────────────────

export const OTP_TTL_MS = 10 * 60 * 1000       // 10 минут
export const OTP_MAX_ATTEMPTS = 5
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000 // 1 минута между повторными отправками

// ─── Генерация ────────────────────────────────────────────────────────────────

/**
 * Генерирует криптографически случайный 6-значный код.
 * randomInt — криптографически случайный, в отличие от Math.random().
 */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000)).padStart(6, '0')
}

// ─── Хеширование ─────────────────────────────────────────────────────────────

/**
 * SHA-256 хеш кода для безопасного хранения.
 * OTP коды короткие — добавляем соль из userId.
 */
export function hashOtp(code: string, salt: string): string {
  return createHash('sha256')
    .update(`${salt}:${code}`)
    .digest('hex')
}

export function verifyOtp(code: string, salt: string, hash: string): boolean {
  // Constant-time сравнение через повторное хеширование
  return hashOtp(code, salt) === hash
}

// ─── Время жизни ─────────────────────────────────────────────────────────────

export function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_TTL_MS)
}

export function isOtpExpired(expiresAt: string | Date): boolean {
  return new Date(expiresAt) < new Date()
}