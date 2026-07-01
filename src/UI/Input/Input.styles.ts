import { cn } from '@/utils/cn';
import type { InputStatus } from './Input.types';

/**
 * Возвращает объединённые CSS-классы для инпута на основе его состояния и размера.
 */
export function inputStyles(
  size: 'sm' | 'md' | 'lg' = 'md',
  status: InputStatus = 'default',
  hasLeftIcon = false,
  hasRightIcon = false,
  className?: string,
): string {
  const baseClasses =
    'w-full rounded-md border bg-white text-[var(--text-primary)] placeholder:text-[var(--text-muted)] ' +
    'focus:outline-none focus:ring-2 focus:ring-[var(--primary)] ' +
    'disabled:cursor-not-allowed disabled:opacity-50 transition-colors duration-200';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-5 py-2.5 text-lg',
  };

  const statusClasses = {
    default: 'border-[var(--border)] focus:border-[var(--primary)]',
    error: 'border-[var(--error)] focus:border-[var(--error)] focus:ring-[var(--error)]',
    success: 'border-[var(--success)] focus:border-[var(--success)] focus:ring-[var(--success)]',
    warning: 'border-[var(--warning)] focus:border-[var(--warning)] focus:ring-[var(--warning)]',
  };

  const paddingLeft = hasLeftIcon ? 'pl-9' : '';
  const paddingRight = hasRightIcon ? 'pr-9' : '';

  return cn(
    baseClasses,
    sizeClasses[size],
    statusClasses[status],
    paddingLeft,
    paddingRight,
    className,
  );
}