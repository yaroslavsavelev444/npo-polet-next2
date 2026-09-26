'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import Button from '@/UI/Button/Button';
import Input from '@/UI/Input/Input';
import { loginAction } from '../actions/login';
import { AuthAlert } from './AuthAlert';
import { Typewriter } from './Typewriter';

interface LoginFormProps {
  /** Устройство не доверенное — дальше экран ввода кода. */
  onRequiresOtp: (email: string) => void;
  /**
   * Вход завершён без кода: устройство доверенное (см. lib/trustedDevice.ts).
   * Cookie на этот момент уже выставлены, остаётся только решить, куда вести
   * пользователя, — и это решает вызывающий: страница входа уводит на
   * исходный адрес, оверлей закрывается и остаётся на месте.
   */
  onAuthenticated: (userId: string) => void;
  /**
   * Переключение на регистрацию БЕЗ перехода по адресу.
   *
   * Нужно оверлею: ссылка на /auth/register увела бы человека из корзины —
   * то есть воспроизвела бы ровно ту потерю контекста, ради устранения
   * которой оверлей и сделан. На отдельной странице входа проп не
   * передаётся, и остаётся обычная ссылка.
   */
  onSwitchToRegister?: () => void;
  /** Ссылку «Забыли пароль?» оверлей сопровождает закрытием — см. AuthOverlay. */
  onForgotPassword?: () => void;
  /**
   * Компактная шапка: в оверлее крупный заголовок с анимацией печати съел бы
   * половину высоты окна, а объяснять, куда человек попал, там не нужно — он
   * сам нажал «Войти и оформить».
   */
  compact?: boolean;
}

type LoginState = Awaited<ReturnType<typeof loginAction>> | null;

// Вспомогательная функция с поддержкой null
function getFieldError(
  state: LoginState,
  field: string
): string | undefined {
  if (!state || state.success) return undefined;
  if ('fieldErrors' in state && state.fieldErrors) {
    return state.fieldErrors[field]?.[0];
  }
  return undefined;
}

export function LoginForm({
  onRequiresOtp,
  onAuthenticated,
  onSwitchToRegister,
  onForgotPassword,
  compact = false,
}: LoginFormProps) {
  const [state, action, isPending] = useActionState(loginAction, null);

  useEffect(() => {
    if (!state?.success) return;

    // Две развилки одного успеха: код нужен — показываем экран ввода;
    // не нужен — вход уже завершён, и заниматься им форме больше нечем.
    if (state.data.requiresOtp) {
      onRequiresOtp(state.data.email);
      return;
    }

    onAuthenticated(state.data.userId ?? '');
  }, [state, onRequiresOtp, onAuthenticated]);

  return (
    <div className="w-full">
      <div className={compact ? 'mb-6' : 'mb-8'}>
        <h1
          className={
            compact
              ? 'text-xl font-semibold tracking-tight text-[var(--text-primary)]'
              : 'text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl'
          }
        >
          {compact ? 'Вход в аккаунт' : <Typewriter text="Добро пожаловать" />}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {compact
            ? 'Корзина сохранится — вы вернётесь на этот же экран'
            : 'Введите данные, чтобы войти в аккаунт'}
        </p>
      </div>

      <form action={action} className="space-y-4">
        {/* Общая ошибка */}
        {state && !state.success && (
          <AuthAlert message={state.error} code={state.code} />
        )}

        {/* defaultValue из ответа action'а, а не пустая строка: React после
            каждого form action сбрасывает неуправляемые поля к их defaultValue,
            и «пустой» default стирал бы только что введённый email при любой
            ошибке входа. Пароль намеренно без defaultValue — он должен
            очищаться. */}
        <Input
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          placeholder="name@example.com"
          defaultValue={state && !state.success ? (state.values?.email ?? '') : ''}
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
            onClick={onForgotPassword}
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
          {onSwitchToRegister ? (
            <button
              type="button"
              onClick={onSwitchToRegister}
              disabled={isPending}
              className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              Зарегистрироваться
            </button>
          ) : (
            <Link
              href="/auth/register"
              className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
            >
              Зарегистрироваться
            </Link>
          )}
        </p>
      </form>
    </div>
  );
}
