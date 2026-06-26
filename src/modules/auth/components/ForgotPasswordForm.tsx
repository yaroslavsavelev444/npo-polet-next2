'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { forgotPasswordAction } from '../actions/initiatePasswordReset'

/**
 * Форма запроса сброса пароля.
 * После отправки показывает сообщение об успехе — независимо от того,
 * существует ли email в системе (защита от email enumeration).
 */
export function ForgotPasswordForm() {
  const [state, action, isPending] = useActionState(forgotPasswordAction, null)

  if (state?.success) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="rounded-lg bg-green-50 border border-green-200 p-6 text-center">
          <div className="mb-3 text-3xl">✉️</div>
          <h2 className="text-lg font-semibold text-green-800 mb-2">Письмо отправлено</h2>
          <p className="text-sm text-green-700">{state.data.message}</p>
          <p className="mt-3 text-xs text-green-600">
            Проверьте папку «Спам», если письмо не пришло.
          </p>
        </div>
        <div className="mt-4 text-center">
          <Link href="/auth/login" className="text-sm text-blue-600 hover:text-blue-500">
            ← Вернуться к входу
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Сброс пароля</h1>
        <p className="mt-1 text-sm text-gray-500">
          Введите email — отправим ссылку для восстановления
        </p>
      </div>

      <form action={action} className="space-y-4">
        {state && !state.success && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
          >
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       placeholder-gray-400 focus:border-blue-500 focus:outline-none
                       focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="name@example.com"
          />
          {state?.fieldErrors?.email && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.email[0]}</p>
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
          {isPending ? 'Отправка...' : 'Отправить ссылку'}
        </button>

        <div className="text-center">
          <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-700">
            ← Вернуться к входу
          </Link>
        </div>
      </form>
    </div>
  )
}