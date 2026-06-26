'use client'

import { useActionState, useEffect } from 'react'
import Link from 'next/link'
import { loginAction } from '../actions/login'

interface LoginFormProps {
  onRequiresOtp: () => void
}

/**
 * Форма входа.
 * useActionState — React 19 API, встроенная обработка pending/error состояния.
 * Не использует useState для полей — нативный FormData.
 */
export function LoginForm({ onRequiresOtp }: LoginFormProps) {
  const [state, action, isPending] = useActionState(loginAction, null)

  useEffect(() => {
    if (state?.success && state.data.requiresOtp) {
      onRequiresOtp()
    }
  }, [state, onRequiresOtp])

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Вход</h1>
        <p className="mt-1 text-sm text-gray-500">Введите данные для входа</p>
      </div>

      <form action={action} className="space-y-4">
        {/* Общая ошибка */}
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Пароль
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       placeholder-gray-400 focus:border-blue-500 focus:outline-none
                       focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="Введите пароль"
          />
          {state?.fieldErrors?.password && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.password[0]}</p>
          )}
        </div>

        <div className="flex items-center justify-end">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            Забыли пароль?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold
                     text-white hover:bg-blue-500 focus:outline-none focus:ring-2
                     focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60
                     disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Вход...' : 'Войти'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Нет аккаунта?{' '}
          <Link href="/auth/register" className="text-blue-600 hover:text-blue-500 font-medium">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  )
}