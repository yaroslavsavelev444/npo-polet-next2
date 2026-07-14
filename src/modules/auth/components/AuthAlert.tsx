import { AlertCircle, Ban, Clock, type LucideIcon } from 'lucide-react';
import type { AuthErrorCode } from '../types';

interface AuthAlertProps {
  message: string;
  code?: AuthErrorCode;
}

type Severity = 'error' | 'warning';

const CODE_SEVERITY: Partial<Record<AuthErrorCode, Severity>> = {
  account_locked: 'warning',
  rate_limited: 'warning',
};

const CODE_ICON: Partial<Record<AuthErrorCode, LucideIcon>> = {
  account_locked: Clock,
  rate_limited: Clock,
  account_blocked: Ban,
  account_suspended: Ban,
};

const SEVERITY_STYLES: Record<Severity, string> = {
  error: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
};

const SEVERITY_ICON_STYLES: Record<Severity, string> = {
  error: 'text-red-500',
  warning: 'text-amber-500',
};

/**
 * Общий баннер ошибки для форм логина/регистрации. Разные AuthErrorCode
 * получают разное оформление (иконка + цвет), чтобы, например, временную
 * блокировку аккаунта или превышение rate-limit нельзя было спутать с
 * обычной "неверный пароль" — не читая текст целиком.
 */
export function AuthAlert({ message, code }: AuthAlertProps) {
  const severity = (code && CODE_SEVERITY[code]) ?? 'error';
  const Icon = (code && CODE_ICON[code]) ?? AlertCircle;

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${SEVERITY_STYLES[severity]}`}
    >
      <Icon
        className={`h-4 w-4 mt-0.5 shrink-0 ${SEVERITY_ICON_STYLES[severity]}`}
        aria-hidden
      />
      <span>{message}</span>
    </div>
  );
}
