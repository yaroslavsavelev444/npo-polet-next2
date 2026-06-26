'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { resetPasswordAction } from '../actions/initiatePasswordReset'

interface ResetPasswordFormProps {
  token: string
}

/**
 * Форма установки нового пароля.
 * Токен приходит из URL (?token=xxx) — читается в Server Component
 * и передаётся пропом. Нет клиентского доступа к URL.
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter()
  const [state, action, isPending] = useActionState(resetPasswordAction, null)

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
        <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
          <p className="text-sm text-red-700">
            Ссылка недействительна. Запросите новую.
          </p>
          <Link
            href="/auth/forgot-password"
            className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-500"
          >
            Запросить новую ссылку
          </Link>
        </div>
      </div>
    )
  }

  if (state?.success) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="rounded-lg bg-green-50 border border-green-200 p-6 text-center">
          <div className="mb-3 text-3xl">✅</div>
          <h2 className="text-lg font-semibold text-green-800 mb-2">Пароль изменён</h2>
          <p className="text-sm text-green-700">{state.data.message}</p>
          <p className="mt-2 text-xs text-green-600">Перенаправление...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Новый пароль</h1>
        <p className="mt-1 text-sm text-gray-500">Придумайте надёжный пароль</p>
      </div>

      <form action={action} className="space-y-4">
        {/* Токен передаётся скрытым полем */}
        <input type="hidden" name="token" value={token} />

        {state && !state.success && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
          >
            {state.error}
            {state.error.includes('недействительна') && (
              <div className="mt-2">
                <Link href="/auth/forgot-password" className="font-medium underline">
                  Запросить новую ссылку
                </Link>
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Новый пароль
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       placeholder-gray-400 focus:border-blue-500 focus:outline-none
                       focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="Минимум 8 символов"
          />
          <p className="mt-1 text-xs text-gray-400">Минимум 8 символов, буквы и цифры</p>
          {state?.fieldErrors?.password && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.password[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Повторите пароль
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       placeholder-gray-400 focus:border-blue-500 focus:outline-none
                       focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="Повторите пароль"
          />
          {state?.fieldErrors?.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">
              {state.fieldErrors.confirmPassword[0]}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold
                     text-white hover:bg-blue-500 focus:outline-none focus:ring-2
                     focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60
                     disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Сохранение...' : 'Сохранить пароль'}
        </button>
      </form>
    </div>
  )
}