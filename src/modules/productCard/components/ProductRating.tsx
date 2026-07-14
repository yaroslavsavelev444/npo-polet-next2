/**
 * modules/productCard/components/ProductRating.tsx
 *
 * Отображение рейтинга и количества отзывов. Пока rating/reviewsCount
 * приходят как 0 (см. TODO в lib/adapter.ts) — компонент в этом случае
 * рендерит нейтральную заглушку "Нет отзывов" вместо пустых нулевых звёзд,
 * чтобы не выглядело как баг.
 */

import { Star } from "lucide-react";
import { formatReviewsCount } from "../lib/format";
import type { ProductRatingProps } from "../types";

export function ProductRating({ rating, reviewsCount }: ProductRatingProps) {
  if (reviewsCount === 0) {
    return (
      <span className="text-xs leading-none text-[var(--text-muted)]">
        Нет отзывов
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Star
        className="h-3.5 w-3.5 fill-[var(--warning)] text-[var(--warning)]"
        aria-hidden="true"
      />
      <span className="text-xs font-semibold leading-none text-[var(--text-primary)]">
        {rating.toFixed(1)}
      </span>
      <span className="text-xs leading-none text-[var(--text-muted)]">
        {formatReviewsCount(reviewsCount)}
      </span>
    </div>
  );
}
