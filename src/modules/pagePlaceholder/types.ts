import type { ReactNode } from "react";

export type PlaceholderVariant = "development" | "maintenance" | "disabled";

export interface PlaceholderAction {
  label: string;
  href: string;
}

export interface PagePlaceholderProps {
  /** Основной заголовок */
  title: string;
  /** Текстовое описание (если не указано, берётся дефолтное для variant) */
  description?: string;
  /** Кастомная иконка (переопределяет иконку варианта) */
  icon?: ReactNode;
  /** Кнопка действия */
  action?: PlaceholderAction;
  /** Визуальный вариант с разными иконками и текстами по умолчанию */
  variant?: PlaceholderVariant;
  /** Растягивать ли секцию на всю доступную высоту экрана */
  fullHeight?: boolean;
}
