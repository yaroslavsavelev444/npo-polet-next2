'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { registerAction } from '../actions/register';
import { AuthAlert } from './AuthAlert';
import type { AcceptedConsentInput } from '../schemas/register.schema';
import Typography, { Heading } from '@/UI/Typography/Typography';
import { Input } from '@/UI/Input/Input';
import { Button } from '@/UI/Button/Button';
import { ConsentList } from '@/components/Consent/ConsentList';
import { ConsentListItem } from '../types';

interface RegisterFormProps {
  consents: ConsentListItem[];
  onRequiresOtp: (email: string) => void;
}

// Вспомогательная функция с поддержкой null
function getFieldError(
  state: Awaited<ReturnType<typeof registerAction>> | null,
  field: string
): string | undefined {
  if (!state || state.success) return undefined;
  if ('fieldErrors' in state && state.fieldErrors) {
    return state.fieldErrors[field]?.[0];
  }
  return undefined;
}

export function RegisterForm({ consents, onRequiresOtp }: RegisterFormProps) {
  const [state, action, isPending] = useActionState(registerAction, null);
  const [checkedSlugs, setCheckedSlugs] = useState<Record<string, boolean>>({});
  const [emailValue, setEmailValue] = useState('');

  const requiredConsents = consents.filter((c) => c.isRequired);
  const allRequiredChecked = requiredConsents.every((c) => checkedSlugs[c.slug]);

  useEffect(() => {
    if (state?.success && state.data.requiresOtp) {
      onRequiresOtp(emailValue);
    }
  }, [state, emailValue, onRequiresOtp]);

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
    <div className="w-full max-w-md mx-auto">
      <div className="mb-8">
        <Heading level={1}>Регистрация</Heading>
        <Typography variant="body-sm" color="secondary" className="mt-1">
          Создайте аккаунт
        </Typography>
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
          value={emailValue}
          onChange={(e) => setEmailValue(e.target.value)}
          errorMessage={getFieldError(state, 'email')}
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
          errorMessage={getFieldError(state, 'name')}
          fullWidth
        />

        <Input
          id="password"
          name="password"
          label="Пароль"
          type="password"
          autoComplete="new-password"
          required
          disabled={isPending}
          placeholder="Минимум 8 символов"
          helperText="Минимум 8 символов, буквы и цифры"
          errorMessage={getFieldError(state, 'password')}
          fullWidth
        />

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
          disabled={isPending || !allRequiredChecked}
        >
          Зарегистрироваться
        </Button>

        <Typography variant="body-sm" color="secondary" className="text-center">
          Уже есть аккаунт?{' '}
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-500 font-medium">
            Войти
          </Link>
        </Typography>
      </form>
    </div>
  );
}