/**
 * modules/productCard/lib/format.ts
 *
 * Форматирование значений для отображения. Вынесено отдельно от pricing.ts,
 * т.к. это про представление (locale/units), а не про бизнес-расчёт.
 */

const rubFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

/** Форматирует цену в виде "12 990 ₽" (без копеек, неразрывный пробел разрядов). */
export function formatPrice(value: number): string {
  return `${rubFormatter.format(Math.round(value))} ₽`;
}

/** Форматирует количество отзывов в скобках: "(128)". */
export function formatReviewsCount(count: number): string {
  return `(${count})`;
}
