import type { Metadata } from "next";

/**
 * Готовый объект метаданных, запрещающий индексацию.
 * Используй, когда страница полностью недоступна.
 */
export const noIndexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Создаёт метаданные с заголовком, описанием и запретом индексации.
 * Удобно для массового использования на разных страницах.
 */
export function createUnavailablePageMetadata(
  title: string,
  description?: string,
): Metadata {
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
    },
  };
}
