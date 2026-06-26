import { redirect } from 'next/navigation'
import { ResetPasswordForm } from '@/modules/auth/components/PasswordResetForm'

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>
}

/**
 * Server Component: извлекает токен из query-параметра.
 * Payload отправляет ссылку вида: /auth/reset-password?token=xxx
 *
 * Токен читается на сервере и передаётся в форму скрытым полем —
 * не нужно делать useSearchParams() на клиенте.
 */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams

  if (!token) {
    redirect('/auth/forgot-password')
  }

  return <ResetPasswordForm token={token} />
}