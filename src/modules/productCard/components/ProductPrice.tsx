/**
 * modules/productCard/components/ProductPrice.tsx
 *
 * Чисто отображающий компонент — без "use client", т.к. не содержит
 * интерактивности и может рендериться на сервере (часть SSR-shell карточки).
 */

import { formatPrice } from "../lib/format";
import type { ProductPriceProps } from "../types";

export function ProductPrice({
  finalPrice,
  originalPrice,
  hasDiscount,
}: ProductPriceProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-lg font-bold leading-none tracking-tight text-[var(--text-primary)] sm:text-xl">
        {formatPrice(finalPrice)}
      </span>
      {hasDiscount && (
        <span className="text-sm leading-none text-[var(--text-muted)] line-through">
          {formatPrice(originalPrice)}
        </span>
      )}
    </div>
  );
}
