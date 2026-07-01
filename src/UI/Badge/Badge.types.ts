import type { ReactNode, HTMLAttributes } from 'react';

// Доступные варианты бейджа
export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent'
  | 'outline';

// Доступные размеры
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Визуальный вариант */
  variant?: BadgeVariant;
  /** Размер бейджа */
  size?: BadgeSize;
  /** Отображать точку-индикатор слева от текста */
  dot?: boolean;
  /** Дополнительные CSS-классы */
  className?: string;
  /** Содержимое бейджа (текст или другие элементы) */
  children?: ReactNode;
}