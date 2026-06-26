'use client'

import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { registerAction } from '../actions/register'
import type { AcceptedConsentInput } from '../schemas/register.schema'

// Тип согласия, приходящего с сервера (Server Component грузит список)
export interface ConsentDoc {
  id: string
  slug: string
  title: string
  version: string
  isRequired: boolean
  documentUrl?: string | null
}

interface RegisterFormProps {
  consents: ConsentDoc[]
  onRequiresOtp: (email: string) => void
}

/**
 * Форма регистрации.
 * Согласия загружаются в Server Component и передаются пропом —
 * нет клиентского запроса, нет состояния загрузки.
 */
export function RegisterForm({ consents, onRequiresOtp }: RegisterFormProps) {
  const [state, action, isPending] = useActionState(registerAction, null)
  const [checkedSlugs, setCheckedSlugs] = useState<Record<string, boolean>>({})
  const [emailValue, setEmailValue] = useState('')

  const requiredConsents = consents.filter((c) => c.isRequired)
  const allRequiredChecked = requiredConsents.every((c) => checkedSlugs[c.slug])

  useEffect(() => {
    if (state?.success && state.data.requiresOtp) {
      onRequiresOtp(emailValue)
    }
  }, [state, emailValue, onRequiresOtp])

  function toggleConsent(slug: string) {
    setCheckedSlugs((prev) => ({ ...prev, [slug]: !prev[slug] }))
  }

  function handleSubmit(formData: FormData) {
    // Собираем принятые согласия в JSON и кладём в FormData
    const accepted: AcceptedConsentInput[] = consents
      .filter((c) => checkedSlugs[c.slug])
      .map((c) => ({ consentId: c.id, slug: c.slug, version: c.version }))

    formData.set('consentsJson', JSON.stringify(accepted))
    return action(formData)
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Регистрация</h1>
        <p className="mt-1 text-sm text-gray-500">Создайте аккаунт</p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        {state && !state.success && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
          >
            {state.error}
          </div>
        )}

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       placeholder-gray-400 focus:border-blue-500 focus:outline-none
                       focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="name@example.com"
          />
          {state?.fieldErrors?.email && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.email[0]}</p>
          )}
        </div>

        {/* Имя */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Имя <span className="text-red-500">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="given-name"
            required
            disabled={isPending}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       placeholder-gray-400 focus:border-blue-500 focus:outline-none
                       focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            placeholder="Иван"
          />
          {state?.fieldErrors?.name && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.name[0]}</p>
          )}
        </div>

        {/* Пароль */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Пароль <span className="text-red-500">*</span>
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

        {/* Подтверждение пароля */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Повторите пароль <span className="text-red-500">*</span>
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
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.confirmPassword[0]}</p>
          )}
        </div>

        {/* Согласия */}
        {consents.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700">Соглашения</p>
            {consents.map((consent) => (
              <label key={consent.slug} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!checkedSlugs[consent.slug]}
                  onChange={() => toggleConsent(consent.slug)}
                  disabled={isPending}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600
                             focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-sm text-gray-600">
                  {consent.isRequired && (
                    <span className="text-red-500 mr-1">*</span>
                  )}
                  {consent.documentUrl ? (
                    <a
                      href={consent.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-500 hover:underline"
                    >
                      {consent.title}
                    </a>
                  ) : (
                    <Link
                      href={`/consents/${consent.slug}`}
                      target="_blank"
                      className="text-blue-600 hover:text-blue-500 hover:underline"
                    >
                      {consent.title}
                    </Link>
                  )}
                  {consent.isRequired && (
                    <span className="ml-1 text-xs text-gray-400">(обязательно)</span>
                  )}
                </span>
              </label>
            ))}
            {state?.fieldErrors?.consents && (
              <p className="text-xs text-red-600">{state.fieldErrors.consents[0]}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending || !allRequiredChecked}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold
                     text-white hover:bg-blue-500 focus:outline-none focus:ring-2
                     focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60
                     disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Регистрация...' : 'Зарегистрироваться'}
        </button>

        <p className="text-center text-sm text-gray-500">
          Уже есть аккаунт?{' '}
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-500 font-medium">
            Войти
          </Link>
        </p>
      </form>
    </div>
  )
}