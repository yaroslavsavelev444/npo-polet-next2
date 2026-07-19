'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { loginAction } from '../actions/login';
import { AuthAlert } from './AuthAlert';
import { Typewriter } from './Typewriter';
import Input from '@/UI/Input/Input';
import Button from '@/UI/Button/Button';

interface LoginFormProps {
  onRequiresOtp: (email: string) => void;
}

// Вспомогательная функция с поддержкой null
function getFieldError(
  state: Awaited<ReturnType<typeof loginAction>> | null,
  field: string
): string | undefined {
  if (!state || state.success) return undefined;
  if ('fieldErrors' in state && state.fieldErrors) {
    return state.fieldErrors[field]?.[0];
  }
  return undefined;
}

export function LoginForm({ onRequiresOtp }: LoginFormProps) {
  const [state, action, isPending] = useActionState(loginAction, null);

  useEffect(() => {
    if (state?.success && state.data.requiresOtp) {
      onRequiresOtp(state.data.email);
    }
  }, [state, onRequiresOtp]);

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          <Typewriter text="Добро пожаловать" />
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Введите данные, чтобы войти в аккаунт
        </p>
      </div>

      <form action={action} className="space-y-4">
        {/* Общая ошибка */}
        {state && !state.success && (
          <AuthAlert message={state.error} code={state.code} />
        )}

        <Input
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          placeholder="name@example.com"
          errorMessage={getFieldError(state, 'email')}
          fullWidth
        />

        <Input
          id="password"
          name="password"
          label="Пароль"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          placeholder="Введите пароль"
          errorMessage={getFieldError(state, 'password')}
          fullWidth
        />

        <div className="flex items-center justify-end">
          <Link
            href="/auth/forgot-password"
            className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            Забыли пароль?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          loading={isPending}
          disabled={isPending}
        >
          Войти
        </Button>

        <p className="text-center text-sm text-[var(--text-secondary)]">
          Нет аккаунта?{' '}
          <Link
            href="/auth/register"
            className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  );
}