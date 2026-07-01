import { cn } from '@/utils/cn';
import type { ButtonVariant, ButtonSize } from './Button.types';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2',
  secondary:
    'bg-[var(--surface-secondary)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:ring-2 focus:ring-[var(--border)]',
  outline:
    'border border-[var(--border)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:ring-2 focus:ring-[var(--border)]',
  ghost:
    'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)] focus:ring-2 focus:ring-[var(--border)]',
  danger:
    'bg-[var(--error)] text-white hover:bg-[var(--error-hover)] focus:ring-2 focus:ring-[var(--error)] focus:ring-offset-2',
  success:
    'bg-[var(--success)] text-white hover:bg-[var(--success-hover)] focus:ring-2 focus:ring-[var(--success)] focus:ring-offset-2',
  warning:
    'bg-[var(--warning)] text-white hover:bg-[var(--warning-hover)] focus:ring-2 focus:ring-[var(--warning)] focus:ring-offset-2',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-base gap-2',
  lg: 'px-6 py-3 text-lg gap-2.5',
};

export function buttonStyles(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
  className?: string,
): string {
  return cn(
    'inline-flex items-center justify-center font-medium rounded-md transition-colors duration-200',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
    variantStyles[variant],
    sizeStyles[size],
    fullWidth && 'w-full',
    className,
  );
}