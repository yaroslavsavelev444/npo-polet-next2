'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import {  getRequestMeta, actionError, actionSuccess } from '../lib/utils'
import { RATE_LIMITS } from '../lib/rateLimit'
import { createOtp } from '../lib/OtpStore'
import { sendOtpEmail } from '../lib/email'
import type { OtpType } from '../types'
import { getPayloadInstance } from '@/payload/services/getPayload'

const resendSchema = z.object({
  type: z.enum(['login_2fa', 'email_verify']),
})

/**
 * Server Action: повторная отправка OTP.
 *
 * Пользователь в обоих сценариях уже залогинен (JWT cookie установлен):
 * - При регистрации: registerAction поставил cookie
 * - При логине: loginAction поставил cookie
 */
export async function resendOtpAction(
  _prevState: unknown,
  formData: FormData,
) {
  const parsed = resendSchema.safeParse({ type: formData.get('type') })
  if (!parsed.success) {
    return actionError('Некорректный тип кода')
  }

  const { type } = parsed.data
  const cookieStore = await cookies()
  const payloadToken = cookieStore.get('payload-token')

  if (!payloadToken) {
    return actionError('Сессия не найдена. Войдите снова.')
  }

  const payload = await getPayloadInstance()

  // Идентифицируем пользователя через JWT
  let userEmail: string
  let userId: string
  try {
    const { user } = await payload.auth({
      headers: new Headers({ cookie: `payload-token=${payloadToken.value}` }),
    })
    if (!user) {
      return actionError('Сессия истекла. Войдите снова.')
    }
    userEmail = user.email
    userId = String(user.id)
  } catch {
    return actionError('Не удалось проверить сессию.')
  }

  const { ip } = await getRequestMeta()

  // Rate limit по email
  const rl = await RATE_LIMITS.otpResend(userEmail)
  if (!rl.allowed) {
    return actionError('Слишком много запросов. Подождите несколько минут.')
  }

  const otp = await createOtp(payload, {
    userId,
    type: type as OtpType,
    ip,
  })

  await sendOtpEmail({ to: userEmail, otp, type: type as OtpType })

  return actionSuccess({ message: 'Код отправлен повторно' })
}