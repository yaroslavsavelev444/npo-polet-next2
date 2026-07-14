'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { resetPasswordAction } from '../actions/initiatePasswordReset'
import { AuthAlert } from './AuthAlert'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'
import Typography, { Heading } from '@/UI/Typography/Typography'
import { Input } from '@/UI/Input/Input'
import { Button } from '@/UI/Button/Button'

interface ResetPasswordFormProps {
  token: string
}

// Вспомогательная функция с поддержкой null — тот же паттерн, что в LoginForm/RegisterForm
function getFieldError(
  state: Awaited<ReturnType<typeof resetPasswordAction>> | null,
  field: string,
): string | undefined {
  if (!state || state.success) return undefined
  if ('fieldErrors' in state && state.fieldErrors) {
    return state.fieldErrors[field]?.[0]
  }
  return undefined
}

/**
 * Форма установки нового пароля.
 * Токен приходит из URL (?token=xxx) — читается в Server Component
 * и передаётся пропом. Нет клиентского доступа к URL.
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter()
  const [state, action, isPending] = useActionState(resetPasswordAction, null)
  const [passwordValue, setPasswordValue] = useState('')

  useEffect(() => {
    if (state?.success) {
      // Небольшая задержка чтобы пользователь увидел сообщение
      const timer = setTimeout(() => router.push('/auth/login'), 2500)
      return () => clearTimeout(timer)
    }
  }, [state, router])

  if (!token) {
    return (
      <div className="w-full max-w-md mx-auto">
        <AuthAlert message="Ссылка недействительна. Запросите новую." />
        <Link
          href="/auth/forgot-password"
          className="mt-3 inline-block text-sm text-[var(--accent)] hover:text-[var(--accent-hover)]"
        >
          Запросить новую ссылку
        </Link>
      </div>
    )
  }

  if (state?.success) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="rounded-lg bg-[var(--success-light)] border border-[var(--success)]/30 p-6 text-center">
          <Typography variant="h4" color="success" className="mb-2">
            Пароль изменён
          </Typography>
          <Typography variant="body-sm" color="secondary">
            {state.data.message}
          </Typography>
          <Typography variant="caption" className="mt-2 block">
            Перенаправление...
          </Typography>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8">
        <Heading level={1}>Новый пароль</Heading>
        <Typography variant="body-sm" color="secondary" className="mt-1">
          Придумайте надёжный пароль
        </Typography>
      </div>

      <form action={action} className="space-y-4">
        {/* Токен передаётся скрытым полем */}
        <input type="hidden" name="token" value={token} />

        {state && !state.success && (
          <div>
            <AuthAlert message={state.error} code={state.code} />
            {state.error.includes('недействительна') && (
              <Link
                href="/auth/forgot-password"
                className="mt-2 inline-block text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] underline"
              >
                Запросить новую ссылку
              </Link>
            )}
          </div>
        )}

        <div>
          <Input
            id="password"
            name="password"
            label="Новый пароль"
            type="password"
            autoComplete="new-password"
            required
            disabled={isPending}
            placeholder="Минимум 8 символов"
            value={passwordValue}
            onChange={(e) => setPasswordValue(e.target.value)}
            errorMessage={getFieldError(state, 'password')}
            fullWidth
          />
          <PasswordStrengthMeter password={passwordValue} />
        </div>

        <Input
          id="confirmPassword"
          name="confirmPassword"
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          placeholder="Повторите пароль"
          errorMessage={getFieldError(state, 'confirmPassword')}
          fullWidth
        />

        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          loading={isPending}
          disabled={isPending}
        >
          Сохранить пароль
        </Button>
      </form>
    </div>
  )
}
