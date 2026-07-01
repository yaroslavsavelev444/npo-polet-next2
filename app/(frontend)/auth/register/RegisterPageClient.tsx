'use client'

import { useState } from 'react'
import { RegisterForm, } from '@/modules/auth/components/RegisterForm'
import { OtpForm } from '@/modules/auth/components/OtpForm'
import { ConsentListItem } from '@/modules/auth/types'

interface RegisterPageClientProps {
  consents: ConsentListItem[]
}

/**
 * Client-компонент: управляет переходом между шагами регистрации.
 * Шаг 1: RegisterForm
 * Шаг 2: OtpForm (email_verify)
 */
export function RegisterPageClient({ consents }: RegisterPageClientProps) {
  const [step, setStep] = useState<'register' | 'otp'>('register')
  const [email, setEmail] = useState('')

  function handleRequiresOtp(enteredEmail: string) {
    setEmail(enteredEmail)
    setStep('otp')
  }

  if (step === 'otp') {
    return (
      <OtpForm
        type="email_verify"
        email={email}
        title="Подтверждение email"
        description="Введите код, отправленный на"
      />
    )
  }

  return <RegisterForm consents={consents} onRequiresOtp={handleRequiresOtp} />
}