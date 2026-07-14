import { headers } from 'next/headers'
import { AuthErrorCode, OtpType } from '../types'


/** Извлекает IP и User-Agent из входящего запроса. */
export async function getRequestMeta() {
  const headersList = await headers()
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown'
  const userAgent = headersList.get('user-agent') ?? ''
  return { ip, userAgent }
}

/**
 * Единый формат ошибки для Server Actions. `code` — необязательная
 * категория (см. AuthErrorCode) для UI, которая позволяет форме показывать
 * разное оформление (например предупреждение для временной блокировки
 * вместо обычной ошибки для неверного пароля), не парся текст сообщения.
 */
export function actionError(
  message: string,
  fieldErrors?: Record<string, string[]>,
  code?: AuthErrorCode,
) {
  return { success: false as const, error: message, fieldErrors, code }
}

export function actionSuccess<T>(data: T) {
  return { success: true as const, data }
}


export function logOtpDev({
  email,
  otp,
  type,
}: {
  email: string
  otp: string
  type: OtpType
}) {
  if (process.env.NODE_ENV !== 'development') return

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📧 OTP CODE')
  console.log('Email:', email)
  console.log('Type:', type)
  console.log('Code:', otp)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}