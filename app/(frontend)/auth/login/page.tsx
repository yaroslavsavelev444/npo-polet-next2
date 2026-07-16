'use client'

import { useState } from 'react'
import { LoginForm } from '@/modules/auth/components/LoginForm'
import { OtpForm } from '@/modules/auth/components/OtpForm'

/**
 * Страница входа.
 *
 * Состояние (два шага) живёт на клиенте — это минимальный UI state,
 * не требующий глобального хранилища.
 *
 * Шаг 1: LoginForm → вводит email + пароль
 * Шаг 2: OtpForm  → вводит 6-значный код
 */
export default function LoginPage() {
  const [step, setStep] = useState<'login' | 'otp'>('login')
  const [email, setEmail] = useState('')

  function handleRequiresOtp(enteredEmail: string) {
    setEmail(enteredEmail)
    setStep('otp')
  }

  if (step === 'otp') {
    return (
      <OtpForm
        type="login_2fa"
        email={email}
        title="Подтверждение входа"
        description="Введите код, отправленный на"
      />
    )
  }

  return <LoginForm onRequiresOtp={handleRequiresOtp} />
}