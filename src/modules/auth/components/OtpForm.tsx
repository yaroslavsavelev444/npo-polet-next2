'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { verifyOtpAction } from '../actions/verifyOtp'
import { resendOtpAction } from '../actions/resendOtp'
import type { OtpType } from '../types'

interface OtpFormProps {
  type: OtpType
  email: string
  title: string
  description: string
}

/**
 * Форма ввода OTP-кода.
 * Используется и для подтверждения входа (login_2fa),
 * и для верификации email (email_verify).
 *
 * Автофокус + автосабмит при вводе 6 цифр.
 */
export function OtpForm({ type, email, title, description }: OtpFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [verifyState, verifyAction, isVerifying] = useActionState(verifyOtpAction, null)
  const [resendState, resendAction, isResending] = useActionState(resendOtpAction, null)

  // Редирект после успешной верификации
  useEffect(() => {
    if (verifyState?.success) {
      router.push(verifyState.data.redirectTo)
      router.refresh()
    }
  }, [verifyState, router])

  // Автофокус при маунте
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Автосабмит при вводе 6 цифр
  function handleCodeInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    e.target.value = val
    if (val.length === 6) {
      // Небольшая задержка чтобы пользователь увидел ввод
      setTimeout(() => formRef.current?.requestSubmit(), 100)
    }
  }

  const maskedEmail = maskEmail(email)

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {description} <span className="font-medium text-gray-700">{maskedEmail}</span>
        </p>
      </div>

      <form ref={formRef} action={verifyAction} className="space-y-4">
        {/* Скрытые поля */}
        <input type="hidden" name="type" value={type} />

        {/* Ошибка верификации */}
        {verifyState && !verifyState.success && (
          <div
            role="alert"
            className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
          >
            {verifyState.error}
          </div>
        )}

        {/* Успех повторной отправки */}
        {resendState?.success && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            Код отправлен повторно
          </div>
        )}

        <div>
          <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
            Код подтверждения
          </label>
          <input
            ref={inputRef}
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            disabled={isVerifying}
            onChange={handleCodeInput}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center
                       text-2xl font-mono tracking-[0.5em] placeholder-gray-300
                       focus:border-blue-500 focus:outline-none focus:ring-1
                       focus:ring-blue-500 disabled:opacity-50"
            placeholder="______"
          />
          {verifyState?.fieldErrors?.code && (
            <p className="mt-1 text-xs text-red-600">{verifyState.fieldErrors.code[0]}</p>
          )}
          <p className="mt-1 text-xs text-gray-400">Код действителен 10 минут</p>
        </div>

        <button
          type="submit"
          disabled={isVerifying}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold
                     text-white hover:bg-blue-500 focus:outline-none focus:ring-2
                     focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60
                     disabled:cursor-not-allowed transition-colors"
        >
          {isVerifying ? 'Проверка...' : 'Подтвердить'}
        </button>
      </form>

      {/* Повторная отправка */}
      <div className="mt-4 text-center">
        <form action={resendAction}>
          <input type="hidden" name="type" value={type} />
          <button
            type="submit"
            disabled={isResending || isVerifying}
            className="text-sm text-blue-600 hover:text-blue-500 disabled:opacity-50
                       disabled:cursor-not-allowed"
          >
            {isResending ? 'Отправка...' : 'Отправить код повторно'}
          </button>
        </form>
        {resendState && !resendState.success && (
          <p className="mt-1 text-xs text-red-600">{resendState.error}</p>
        )}
      </div>
    </div>
  )
}

// Маскируем email для отображения: na***@example.com
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const visible = local.slice(0, 2)
  return `${visible}***@${domain}`
}