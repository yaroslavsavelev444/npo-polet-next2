'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { registerAction } from '../actions/register';
import { AuthAlert } from './AuthAlert';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { Typewriter } from './Typewriter';
import { validateEmail } from '../lib/email';
import type { AcceptedConsentInput } from '../schemas/register.schema';
import Typography from '@/UI/Typography/Typography';
import { Input } from '@/UI/Input/Input';
import { Button } from '@/UI/Button/Button';
import { ConsentList } from '@/components/Consent/ConsentList';
import { ConsentListItem } from '../types';

interface RegisterFormProps {
  consents: ConsentListItem[];
  onRequiresOtp: (email: string) => void;
}

type RegisterState = Awaited<ReturnType<typeof registerAction>> | null;

// Вспомогательная функция с поддержкой null
function getFieldError(
  state: RegisterState,
  field: string
): string | undefined {
  if (!state || state.success) return undefined;
  if ('fieldErrors' in state && state.fieldErrors) {
    return state.fieldErrors[field]?.[0];
  }
  return undefined;
}

/**
 * Значение поля, к которому React вернёт форму после отработки action'а.
 *
 * React сбрасывает неуправляемые поля формы к их `defaultValue` сразу после
 * каждого form action (recursivelyResetForms в react-dom). Сброс происходит
 * ПОСЛЕ рендера с новым состоянием, поэтому подставленное сюда значение и
 * становится тем, что пользователь увидит в поле. Возвращая эхо введённых
 * данных, мы сохраняем анкету при ошибке; отсутствие эха для паролей
 * очищает их — ровно то поведение, которого ждут от формы входа.
 */
function getFieldValue(state: RegisterState, field: 'email' | 'name'): string {
  if (!state || state.success) return '';
  return state.values?.[field] ?? '';
}

export function RegisterForm({ consents, onRequiresOtp }: RegisterFormProps) {
  const [state, action, isPending] = useActionState(registerAction, null);
  const [checkedSlugs, setCheckedSlugs] = useState<Record<string, boolean>>({});
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  // Зеркало пароля только для индикатора надёжности. Само поле неуправляемое,
  // иначе React-состояние и очищенный сбросом DOM разошлись бы: индикатор
  // показывал бы силу уже стёртого пароля.
  const [passwordValue, setPasswordValue] = useState('');

  const requiredConsents = consents.filter((c) => c.isRequired);
  const allRequiredChecked = requiredConsents.every((c) => checkedSlugs[c.slug]);

  // Мгновенная клиентская подсказка теми же функциями, что и на сервере
  // (lib/email). Настоящая проверка всё равно повторяется в registerAction —
  // это только UX. Пустое поле не подсвечиваем: об этом скажет required.
  const handleEmailChange = (value: string) => {
    setEmailError(value.trim() ? (validateEmail(value) ?? undefined) : undefined);
  };

  useEffect(() => {
    if (!state) return;

    // Форма сброшена React'ом — синхронизируем производные состояния полей,
    // которые сброс не затрагивает (они живут в React, а не в DOM).
    setPasswordValue('');

    if (state.success && state.data.requiresOtp) {
      onRequiresOtp(state.data.email);
    }
  }, [state, onRequiresOtp]);

  const toggleConsent = (slug: string) => {
    setCheckedSlugs((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  const handleSubmit = (formData: FormData) => {
    const accepted: AcceptedConsentInput[] = consents
      .filter((c) => checkedSlugs[c.slug])
      .map((c) => ({ consentId: c.id, slug: c.slug, version: c.version }));

    formData.set('consentsJson', JSON.stringify(accepted));
    return action(formData);
  };

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          <Typewriter text="Рады знакомству!" />
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Создайте аккаунт, чтобы начать
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4">
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
          defaultValue={getFieldValue(state, 'email')}
          onChange={(e) => handleEmailChange(e.target.value)}
          errorMessage={emailError ?? getFieldError(state, 'email')}
          fullWidth
        />

        <Input
          id="name"
          name="name"
          label="Имя"
          type="text"
          autoComplete="given-name"
          required
          disabled={isPending}
          placeholder="Иван"
          defaultValue={getFieldValue(state, 'name')}
          errorMessage={getFieldError(state, 'name')}
          fullWidth
        />

        <div>
          <Input
            id="password"
            name="password"
            label="Пароль"
            type="password"
            autoComplete="new-password"
            required
            disabled={isPending}
            placeholder="Минимум 8 символов"
            onChange={(e) => setPasswordValue(e.target.value)}
            errorMessage={getFieldError(state, 'password')}
            fullWidth
          />
          <PasswordStrengthMeter password={passwordValue} />
        </div>

        <Input
          id="confirmPassword"
          name="confirmPassword"
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          placeholder="Повторите пароль"
          errorMessage={getFieldError(state, 'confirmPassword')}
          fullWidth
        />

        <ConsentList
          consents={consents}
          checkedSlugs={checkedSlugs}
          onToggle={toggleConsent}
          disabled={isPending}
          error={getFieldError(state, 'consents')}
        />

        <Button
          type="submit"
          variant="primary"
          size="md"
          fullWidth
          loading={isPending}
          disabled={isPending || !allRequiredChecked || Boolean(emailError)}
        >
          Зарегистрироваться
        </Button>

        <Typography variant="body-sm" color="secondary" className="text-center">
          Уже есть аккаунт?{' '}
          <Link
            href="/auth/login"
            className="font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
          >
            Войти
          </Link>
        </Typography>
      </form>
    </div>
  );
}
