import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Серверный «перец» для хеша OTP. Без него codeHash = SHA-256(userId:code) —
 * а userId известен/предсказуем, поэтому при утечке таблицы otp-codes
 * 6-значный код брутфорсится офлайн мгновенно (10^6 вариантов). Перец из
 * PAYLOAD_SECRET (в БД его нет) делает офлайн-перебор бесполезным без
 * серверного секрета.
 */
function getPepper(): string {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    // На сервере PAYLOAD_SECRET валидируется в env.ts и всегда задан; это лишь
    // страховка, чтобы отсутствие секрета не превращалось в тихий пустой перец.
    throw new Error('PAYLOAD_SECRET is required to hash OTP codes')
  }
  return secret
}

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
 * OTP коды короткие — солим userId и «перчим» серверным секретом (getPepper).
 */
export function hashOtp(code: string, salt: string): string {
  return createHash('sha256')
    .update(`${getPepper()}:${salt}:${code}`)
    .digest('hex')
}

/**
 * Constant-time сравнение двух hex-хешей SHA-256. Отдельно от verifyOtp,
 * потому что при атомарной проверке кода (см. OtpStore.verifyOtpCode) хеш
 * ожидаемого кода уже посчитан — сравниваются именно два готовых хеша.
 */
export function hashesEqual(expectedHex: string, actualHex: string): boolean {
  let expected: Buffer
  let actual: Buffer
  try {
    expected = Buffer.from(expectedHex, 'hex')
    actual = Buffer.from(actualHex, 'hex')
  } catch {
    return false
  }
  if (expected.length === 0 || expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

export function verifyOtp(code: string, salt: string, hash: string): boolean {
  // Constant-time сравнение хешей: оба — hex SHA-256 (64 символа), одинаковой
  // длины, поэтому timingSafeEqual применим. Обычный === сравнивает строки
  // посимвольно и утекал бы позицию первого расхождения по времени.
  const expected = Buffer.from(hashOtp(code, salt), 'hex')
  let actual: Buffer
  try {
    actual = Buffer.from(hash, 'hex')
  } catch {
    return false
  }
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

// ─── Время жизни ─────────────────────────────────────────────────────────────

export function otpExpiresAt(): Date {
  return new Date(Date.now() + OTP_TTL_MS)
}

export function isOtpExpired(expiresAt: string | Date): boolean {
  return new Date(expiresAt) < new Date()
}