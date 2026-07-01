"use client";

/**
 * modules/productCard/hooks/useAddToCart.ts
 *
 * TODO: временно закомментирован useCartStore, пока стор не реализован.
 * После создания стора раскомментировать импорт и использование.
 */

import { useCallback, useState } from "react";
import { useToast } from "@once-ui-system/core";
// import { useCartStore } from "@/shared/store/cartStore"; // TODO: раскомментировать когда стор будет готов
import type { ProductCardData } from "../types";

export interface UseAddToCartResult {
  isAdding: boolean;
  addToCart: (product: ProductCardData, quantity: number) => Promise<void>;
}

export function useAddToCart(): UseAddToCartResult {
  const { addToast } = useToast();
  const [isAdding, setIsAdding] = useState(false);

  // TODO: раскомментировать и использовать стор
  // const addItem = useCartStore((state) => state.addItem);
  // Временно заглушка
  const addItem = useCallback(() => {
    console.warn("useCartStore заглушка: добавление в корзину не реализовано");
  }, []);

  const addToCart = useCallback(
    async (product: ProductCardData, quantity: number) => {
      setIsAdding(true);
      try {
        // Временно заглушка: просто эмулируем успех
        // addItem({ productId: product.id, title: product.title, ... }, quantity);
        addItem(); // вызов заглушки

        addToast({
          variant: "success",
          message: `«${product.title}» добавлен в корзину (${quantity} шт.)`,
        });
      } catch {
        addToast({
          variant: "danger",
          message: "Не удалось добавить товар в корзину. Попробуйте ещё раз.",
        });
      } finally {
        setIsAdding(false);
      }
    },
    [addItem, addToast],
  );

  return { isAdding, addToCart };
}