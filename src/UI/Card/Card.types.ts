import type { ReactNode, HTMLAttributes } from 'react';

// Доступные варианты карточки
export type CardVariant = 'default' | 'elevated' | 'outlined' | 'ghost';

// Доступные размеры
export type CardSize = 'sm' | 'md' | 'lg';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Вариант оформления карточки */
  variant?: CardVariant;
  /** Размер внутренних отступов */
  size?: CardSize;
  /** Содержимое шапки (отображается сверху с разделителем) */
  header?: ReactNode;
  /** Содержимое подвала (отображается снизу с разделителем) */
  footer?: ReactNode;
  /** Делает карточку кликабельной (добавляет курсор, ховер-эффекты и role="button") */
  clickable?: boolean;
  /** Отключает внутренние отступы (полезно для вложенных контентов типа изображений) */
  noPadding?: boolean;
  /** Дополнительные CSS-классы */
  className?: string;
  /** Основное содержимое карточки */
  children?: ReactNode;
}