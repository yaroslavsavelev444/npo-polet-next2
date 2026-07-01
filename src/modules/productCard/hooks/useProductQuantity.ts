"use client";

/**
 * modules/productCard/hooks/useProductQuantity.ts
 *
 * Локальный state селектора количества + валидация против min/max заказа.
 * Чистая презентационная логика — не знает о корзине.
 */

import { useCallback, useState } from "react";
import { clampOrderQuantity } from "../lib/pricing";

export interface UseProductQuantityResult {
  quantity: number;
  isOutOfRange: boolean;
  setQuantity: (value: number) => void;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
}

export function useProductQuantity(
  minOrderQuantity: number,
  maxOrderQuantity: number,
): UseProductQuantityResult {
  const initial = Math.max(minOrderQuantity, 1);
  const [quantity, setQuantityState] = useState(initial);
  const [isOutOfRange, setIsOutOfRange] = useState(false);

  const applyValue = useCallback(
    (value: number) => {
      const { value: clamped, isValid } = clampOrderQuantity(
        value,
        minOrderQuantity,
        maxOrderQuantity,
      );
      // Показываем введённое значение как есть (даже если вне диапазона),
      // чтобы пользователь видел, что он напечатал, и предупреждение —
      // но кнопка "в корзину" будет заблокирована через isOutOfRange.
      setQuantityState(value);
      setIsOutOfRange(!isValid);
      return clamped;
    },
    [minOrderQuantity, maxOrderQuantity],
  );

  const setQuantity = useCallback(
    (value: number) => {
      applyValue(value);
    },
    [applyValue],
  );

  const increase = useCallback(() => {
    applyValue(quantity + 1);
  }, [applyValue, quantity]);

  const decrease = useCallback(() => {
    applyValue(Math.max(quantity - 1, minOrderQuantity));
  }, [applyValue, quantity, minOrderQuantity]);

  const reset = useCallback(() => {
    setQuantityState(initial);
    setIsOutOfRange(false);
  }, [initial]);

  return { quantity, isOutOfRange, setQuantity, increase, decrease, reset };
}
