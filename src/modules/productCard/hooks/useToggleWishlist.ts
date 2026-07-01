"use client";

/**
 * modules/productCard/hooks/useToggleWishlist.ts
 *
 * TODO: временно закомментирован useWishlistStore, пока стор не реализован.
 * После создания стора раскомментировать импорт и использование.
 */

import { useCallback, useState } from "react";
import { useToast } from "@once-ui-system/core";
// import { useWishlistStore } from "@/shared/store/wishlistStore"; // TODO: раскомментировать когда стор будет готов
import type { ProductCardData } from "../types";

export interface UseToggleWishlistResult {
  isInWishlist: boolean;
  isToggling: boolean;
  toggleWishlist: (product: ProductCardData) => Promise<void>;
}

export function useToggleWishlist(productId: string): UseToggleWishlistResult {
  const { addToast } = useToast();
  const [isToggling, setIsToggling] = useState(false);
  // Временно локальное состояние для isInWishlist (заглушка)
  const [isInWishlist, setIsInWishlist] = useState(false);

  // TODO: раскомментировать и использовать стор
  // const isInWishlist = useWishlistStore((state) => Boolean(state.items[productId]));
  // const toggleItem = useWishlistStore((state) => state.toggleItem);

  // Временная заглушка для toggleItem
  const toggleItem = useCallback((product: ProductCardData) => {
    console.warn("useWishlistStore заглушка: переключение избранного не реализовано");
    // Имитируем переключение
    const nowInWishlist = !isInWishlist;
    setIsInWishlist(nowInWishlist);
    return nowInWishlist;
  }, [isInWishlist]);

  const toggleWishlist = useCallback(
    async (product: ProductCardData) => {
      setIsToggling(true);
      try {
        const nowInWishlist = toggleItem(product);

        addToast({
          variant: "success",
          message: nowInWishlist
            ? `«${product.title}» добавлен в избранное`
            : `«${product.title}» удалён из избранного`,
        });
      } catch {
        addToast({
          variant: "danger",
          message: "Не удалось обновить избранное. Попробуйте ещё раз.",
        });
      } finally {
        setIsToggling(false);
      }
    },
    [addToast, toggleItem],
  );

  return { isInWishlist, isToggling, toggleWishlist };
}