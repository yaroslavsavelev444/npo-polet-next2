"use client";

/**
 * modules/productCard/components/ProductActions.tsx
 *
 * Плавающие кнопки действий поверх изображения (избранное, быстрый просмотр).
 * Клиентский компонент: подписан на wishlistStore и обрабатывает клики.
 *
 * Видимость по умолчанию управляется через Tailwind `group-hover:opacity-100`
 * (родитель — ProductCard.tsx объявляет `group`), на мобильных всегда видно
 * через media query `max-md:opacity-100` — это убирает необходимость
 * в JS-детекте isMobile, который был в старом проекте (useResponsive).
 */

import { Heart, Eye } from "lucide-react";
import { IconButton } from "@once-ui-system/core";
import { useToggleWishlist } from "../hooks/useToggleWishlist";
import type { ProductActionsProps, ProductCardData } from "../types";

interface Props extends ProductActionsProps {
  product: ProductCardData;
}

export function ProductActions({ product, showQuickView, onQuickView }: Props) {
  const { isInWishlist, isToggling, toggleWishlist } = useToggleWishlist(product.id);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggleWishlist(product);
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onQuickView?.();
  };

  return (
    <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 max-md:opacity-100">
      <IconButton
        variant="secondary"
        size="s"
        loading={isToggling}
        onClick={handleToggleFavorite}
        tooltip={isInWishlist ? "Удалить из избранного" : "Добавить в избранное"}
        tooltipPosition="left"
        aria-label={isInWishlist ? "Удалить из избранного" : "Добавить в избранное"}
        className="!bg-white/95 shadow-sm backdrop-blur-sm"
      >
        <Heart
          className={
            isInWishlist
              ? "h-4 w-4 fill-red-500 text-red-500"
              : "h-4 w-4 text-neutral-500"
          }
        />
      </IconButton>

      {showQuickView && (
        <IconButton
          variant="secondary"
          size="s"
          onClick={handleQuickView}
          tooltip="Быстрый просмотр"
          tooltipPosition="left"
          aria-label="Быстрый просмотр"
          className="!bg-white/95 shadow-sm backdrop-blur-sm"
        >
          <Eye className="h-4 w-4 text-neutral-500" />
        </IconButton>
      )}
    </div>
  );
}
