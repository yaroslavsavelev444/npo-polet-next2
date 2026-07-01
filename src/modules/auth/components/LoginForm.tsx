'use client';

import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { loginAction } from '../actions/login';
import Input from '@/UI/Input/Input';
import Button from '@/UI/Button/Button';

interface LoginFormProps {
  onRequiresOtp: () => void;
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
      onRequiresOtp();
    }
  }, [state, onRequiresOtp]);

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
            className="text-sm text-blue-600 hover:text-blue-500"
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

        <p className="text-center text-sm text-gray-500">
          Нет аккаунта?{' '}
          <Link href="/auth/register" className="text-blue-600 hover:text-blue-500 font-medium">
            Зарегистрироваться
          </Link>
        </p>
      </form>
    </div>
  );
}