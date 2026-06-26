import { headers } from 'next/headers'
import { OtpType } from '../types'


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

/** Единый формат ошибки для Server Actions. */
export function actionError(message: string, fieldErrors?: Record<string, string[]>) {
  return { success: false as const, error: message, fieldErrors }
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