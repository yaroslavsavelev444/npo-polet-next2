import { sql } from '@payloadcms/db-postgres'
import type { BasePayload } from 'payload'
import type { OtpType } from '../types'
import {
  generateOtp,
  hashesEqual,
  hashOtp,
  OTP_MAX_ATTEMPTS,
  otpExpiresAt,
} from './otp'

/**
 * Создаёт новый OTP для пользователя.
 * Инвалидирует все предыдущие неиспользованные коды того же типа.
 */
export async function createOtp(
  payload: BasePayload,
  {
    userId,
    type,
    ip,
  }: { userId: string | number; type: OtpType; ip: string },
): Promise<string> {
  // Приводим userId к числу (тип поля user в OtpCode — number)
  const userIdNum = typeof userId === 'string' ? Number(userId) : userId
  if (isNaN(userIdNum)) {
    throw new Error('Invalid userId: must be a number')
  }

  // Инвалидируем старые коды этого типа
  const { docs: existing } = await payload.find({
    collection: 'otp-codes',
    where: {
      and: [
        { user: { equals: userIdNum } },
        { type: { equals: type } },
        { used: { equals: false } },
      ],
    },
    overrideAccess: true,
  })

  await Promise.all(
    existing.map((otp) =>
      payload.update({
        collection: 'otp-codes',
        id: otp.id,
        data: { used: true },
        overrideAccess: true,
      }),
    ),
  )

  // Генерируем новый код
  const code = generateOtp()
  const codeHash = hashOtp(code, String(userIdNum))

  await payload.create({
    collection: 'otp-codes',
    data: {
      user: userIdNum, // теперь число
      type,
      codeHash,
      expiresAt: otpExpiresAt().toISOString(),
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      used: false,
      ip,
    },
    overrideAccess: true,
  })

  return code
}

export type VerifyOtpResult =
  | { ok: true; otpId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' | 'max_attempts' | 'invalid' }

type ClaimRow = {
  id: number
  code_hash: string
  attempts: string | number
  max_attempts: string | number
}

/**
 * Проверяет OTP-код.
 *
 * Попытка «занимается» ОДНИМ атомарным UPDATE ... RETURNING до сверки хеша, а
 * не читается-проверяется-записывается по отдельности. Раньше счётчик
 * инкрементировался вторым запросом уже после сравнения: несколько
 * одновременных запросов читали одно и то же `attempts`, каждый видел его
 * меньше лимита, и число реальных попыток ограничивалось только тем, сколько
 * их успевало пройти параллельно, — 6-значный код при этом перебирается
 * пачками (CWE-362). Условия `used = false`, `attempts < max_attempts` и
 * `expires_at > NOW()` теперь тоже часть этого же UPDATE, поэтому «свободной»
 * попытки не остаётся ни при какой конкуренции.
 */
export async function verifyOtpCode(
  payload: BasePayload,
  {
    userId,
    type,
    code,
  }: { userId: string | number; type: OtpType; code: string },
): Promise<VerifyOtpResult> {
  const userIdNum = typeof userId === 'string' ? Number(userId) : userId
  if (isNaN(userIdNum)) {
    return { ok: false, reason: 'not_found' }
  }

  const claimed = (await payload.db.drizzle.execute(sql`
    UPDATE otp_codes
    SET attempts = attempts + 1, updated_at = NOW()
    WHERE id = (
      SELECT id FROM otp_codes
      WHERE user_id = ${userIdNum} AND type = ${type} AND used = false
      ORDER BY created_at DESC
      LIMIT 1
    )
      AND used = false
      AND attempts < max_attempts
      AND expires_at > NOW()
    RETURNING id, code_hash, attempts, max_attempts
  `)) as { rows?: ClaimRow[] }

  const row = claimed.rows?.[0]

  if (!row) {
    // Попытку занять не удалось — выясняем, почему именно, чтобы UI показал
    // осмысленное сообщение (истёк / исчерпаны попытки / кода нет вовсе).
    return { ok: false, reason: await describeUnclaimable(payload, userIdNum, type) }
  }

  const attempts = Number(row.attempts)
  const maxAttempts = Number(row.max_attempts)

  if (!hashesEqual(hashOtp(code, String(userIdNum)), row.code_hash)) {
    // Исчерпаны попытки — гасим код целиком, чтобы остаток диапазона нельзя
    // было добрать следующим запросом кода на тот же хеш.
    if (attempts >= maxAttempts) {
      await payload.db.drizzle.execute(sql`
        UPDATE otp_codes SET used = true, updated_at = NOW() WHERE id = ${row.id}
      `)
    }
    return { ok: false, reason: 'invalid' }
  }

  // Успех фиксируем условно: если параллельный запрос уже погасил код,
  // второй раз он не сработает (одноразовость кода).
  const consumed = (await payload.db.drizzle.execute(sql`
    UPDATE otp_codes SET used = true, updated_at = NOW()
    WHERE id = ${row.id} AND used = false
    RETURNING id
  `)) as { rows?: { id: number }[] }

  if (!consumed.rows?.length) {
    return { ok: false, reason: 'used' }
  }

  return { ok: true, otpId: String(row.id) }
}

/** Почему активный код не удалось «занять»: для сообщения пользователю. */
async function describeUnclaimable(
  payload: BasePayload,
  userIdNum: number,
  type: OtpType,
): Promise<'not_found' | 'expired' | 'max_attempts'> {
  const result = (await payload.db.drizzle.execute(sql`
    SELECT expires_at, attempts, max_attempts
    FROM otp_codes
    WHERE user_id = ${userIdNum} AND type = ${type} AND used = false
    ORDER BY created_at DESC
    LIMIT 1
  `)) as {
    rows?: { expires_at: string | Date; attempts: string | number; max_attempts: string | number }[]
  }

  const row = result.rows?.[0]
  if (!row) return 'not_found'
  if (new Date(row.expires_at) <= new Date()) return 'expired'
  if (Number(row.attempts) >= Number(row.max_attempts)) return 'max_attempts'
  return 'not_found'
}
