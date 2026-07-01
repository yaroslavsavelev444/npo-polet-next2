/**
 * modules/productCard/lib/pricing.ts
 *
 * Чистые функции расчёта цены. Без побочных эффектов и без зависимостей
 * от React — легко покрываются unit-тестами в изоляции.
 */

import type { ProductCardDiscount } from "../types";

export interface PriceBreakdown {
  finalPrice: number;
  hasDiscount: boolean;
  discountPercentage: number | null;
}

/**
 * Считает финальную цену с учётом скидки и сопутствующие производные значения.
 *
 * Зеркалит логику из старого ProductCard (calculateFinalPrice), но переведено
 * на единый формат скидки { isActive, percentage } — фактическое значение
 * скидки (процент/фикс. сумма) уже должно быть приведено к проценту
 * на этапе адаптера, чтобы UI-слой не знал о вариантах "percentage | fixed".
 */
export function calculatePriceBreakdown(
  priceForIndividual: number,
  discount: ProductCardDiscount,
): PriceBreakdown {
  if (!discount.isActive || !discount.percentage || discount.percentage <= 0) {
    return {
      finalPrice: priceForIndividual,
      hasDiscount: false,
      discountPercentage: null,
    };
  }

  const clampedPercentage = Math.min(Math.max(discount.percentage, 0), 100);
  const finalPrice = priceForIndividual * (1 - clampedPercentage / 100);

  return {
    finalPrice: Math.round(finalPrice * 100) / 100,
    hasDiscount: finalPrice < priceForIndividual,
    discountPercentage: Math.round(clampedPercentage),
  };
}

/**
 * Зажимает желаемое количество в диапазон [min, max] заказа.
 * Возвращает кортеж [значение, валидно_ли_исходное].
 */
export function clampOrderQuantity(
  value: number,
  minOrderQuantity: number,
  maxOrderQuantity: number,
): { value: number; isValid: boolean } {
  const safeMin = Math.max(minOrderQuantity, 1);
  const safeMax = Math.max(maxOrderQuantity, safeMin);

  if (value < safeMin || value > safeMax) {
    return { value: Math.min(Math.max(value, safeMin), safeMax), isValid: false };
  }

  return { value, isValid: true };
}
