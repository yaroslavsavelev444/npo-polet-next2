import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@/payloadconfig'
import { OtpForm } from '@/modules/auth/components/OtpForm'

/**
 * Server Component: страница верификации OTP при входе.
 *
 * Сюда редиректит middleware, если пользователь авторизован (есть JWT),
 * но ещё не прошёл 2FA (twoFAVerified: false).
 *
 * Считываем email пользователя на сервере для OtpForm.
 */
export default async function VerifyOtpPage() {
  const cookieStore = await cookies()
  const payloadToken = cookieStore.get('payload-token')

  if (!payloadToken) {
    redirect('/auth/login')
  }

  const payload = await getPayload({ config })
  const h = await headers()

  const { user } = await payload.auth({ headers: h })

  if (!user) {
    redirect('/auth/login')
  }

  // Если уже прошёл 2FA — идём дальше
  if (user.twoFAVerified) {
    redirect('/profile')
  }

  return (
    <OtpForm
      type="login_2fa"
      email={user.email}
      title="Подтверждение входа"
      description="Введите код, отправленный на"
    />
  )
}