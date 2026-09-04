"use client";

import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/UI/Button/Button";
import { Input } from "@/UI/Input/Input";
import { forgotPasswordAction } from "../actions/initiatePasswordReset";
import { AuthAlert } from "./AuthAlert";

/**
 * Форма запроса сброса пароля.
 * После отправки показывает сообщение об успехе — независимо от того,
 * существует ли email в системе (защита от email enumeration).
 */
export function ForgotPasswordForm() {
  const [state, action, isPending] = useActionState(forgotPasswordAction, null);

  if (state?.success) {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-[var(--success)]/30 bg-[var(--success)]/10 !p-6 text-center animate-[fade-in-up_260ms_cubic-bezier(0.16,1,0.3,1)]">
          <MailCheck
            className="h-7 w-7 text-[var(--success)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Письмо отправлено
          </h2>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {state.data.message}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Проверьте папку «Спам», если письмо не пришло.
          </p>
        </div>

        <div className="mt-5 text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
          >
            <ArrowLeft size={14} aria-hidden />
            Вернуться к входу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          Сброс пароля
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Введите email — отправим ссылку для восстановления
        </p>
      </div>

      <form action={action} className="space-y-4">
        {state && !state.success && (
          <AuthAlert message={state.error} code={state.code} />
        )}

        {/* defaultValue из ответа action'а: React после каждого form action
            сбрасывает неуправляемые поля к их defaultValue, и пустой default
            стирал бы уже введённый адрес при ошибке. */}
        <Input
          id="email"
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          placeholder="name@example.com"
          defaultValue={state && !state.success ? (state.values?.email ?? "") : ""}
          errorMessage={
            state && !state.success ? state.fieldErrors?.email?.[0] : undefined
          }
          fullWidth
        />

        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          loading={isPending}
          disabled={isPending}
        >
          Отправить ссылку
        </Button>

        <div className="text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={14} aria-hidden />
            Вернуться к входу
          </Link>
        </div>
      </form>
    </div>
  );
}
