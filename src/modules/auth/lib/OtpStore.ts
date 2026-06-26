import type { BasePayload } from 'payload'
import {
  generateOtp,
  hashOtp,
  isOtpExpired,
  otpExpiresAt,
  verifyOtp,
  OTP_MAX_ATTEMPTS,
} from './otp'
import type { OtpType } from '../types'

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

/**
 * Проверяет OTP-код.
 * Автоматически инкрементирует счётчик попыток и помечает использованным при успехе.
 */
export async function verifyOtpCode(
  payload: BasePayload,
  {
    userId,
    type,
    code,
  }: { userId: string | number; type: OtpType; code: string },
): Promise<VerifyOtpResult> {
  // Приводим userId к числу
  const userIdNum = typeof userId === 'string' ? Number(userId) : userId
  if (isNaN(userIdNum)) {
    return { ok: false, reason: 'not_found' }
  }

  // Берём последний активный код данного типа
  const { docs } = await payload.find({
    collection: 'otp-codes',
    where: {
      and: [
        { user: { equals: userIdNum } },
        { type: { equals: type } },
        { used: { equals: false } },
      ],
    },
    sort: '-createdAt',
    limit: 1,
    overrideAccess: true,
  })

  if (docs.length === 0) {
    return { ok: false, reason: 'not_found' }
  }

  const otpRecord = docs[0]

  if (isOtpExpired(otpRecord.expiresAt)) {
    return { ok: false, reason: 'expired' }
  }

  // Безопасное получение значений (защита от null/undefined)
  const attempts = otpRecord.attempts ?? 0
  const maxAttempts = otpRecord.maxAttempts ?? OTP_MAX_ATTEMPTS

  if (attempts >= maxAttempts) {
    return { ok: false, reason: 'max_attempts' }
  }

  const isValid = verifyOtp(code, String(userIdNum), otpRecord.codeHash)

  if (!isValid) {
    const newAttempts = attempts + 1
    await payload.update({
      collection: 'otp-codes',
      id: otpRecord.id,
      data: {
        attempts: newAttempts,
        // Если исчерпаны — помечаем использованным, чтобы нельзя было угадать
        ...(newAttempts >= maxAttempts ? { used: true } : {}),
      },
      overrideAccess: true,
    })
    return { ok: false, reason: 'invalid' }
  }

  // Помечаем использованным
  await payload.update({
    collection: 'otp-codes',
    id: otpRecord.id,
    data: { used: true },
    overrideAccess: true,
  })

  // Возвращаем ID как строку (соответствует типу VerifyOtpResult)
  return { ok: true, otpId: String(otpRecord.id) }
}