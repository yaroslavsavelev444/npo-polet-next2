/**
 * modules/productCard/components/ProductPrice.tsx
 *
 * Чисто отображающий компонент — без "use client", т.к. не содержит
 * интерактивности и может рендериться на сервере (часть SSR-shell карточки).
 */

import { Text } from "@once-ui-system/core";
import { formatPrice } from "../lib/format";
import type { ProductPriceProps } from "../types";

export function ProductPrice({
  finalPrice,
  originalPrice,
  hasDiscount,
}: ProductPriceProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Text
        variant="heading-strong-m"
        onBackground={hasDiscount ? "danger-strong" : "neutral-strong"}
        className="leading-none"
      >
        {formatPrice(finalPrice)}
      </Text>
      {hasDiscount && (
        <Text
          variant="body-default-s"
          onBackground="neutral-weak"
          className="leading-none line-through opacity-70"
        >
          {formatPrice(originalPrice)}
        </Text>
      )}
    </div>
  );
}
