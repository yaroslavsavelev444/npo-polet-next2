/**
 * modules/productCard/components/ProductRating.tsx
 *
 * Отображение рейтинга и количества отзывов. Пока rating/reviewsCount
 * приходят как 0 (см. TODO в lib/adapter.ts) — компонент в этом случае
 * рендерит нейтральную заглушку "Нет отзывов" вместо пустых нулевых звёзд,
 * чтобы не выглядело как баг.
 */

import { Star } from "lucide-react";
import { Text } from "@once-ui-system/core";
import { formatReviewsCount } from "../lib/format";
import type { ProductRatingProps } from "../types";

export function ProductRating({ rating, reviewsCount }: ProductRatingProps) {
  if (reviewsCount === 0) {
    return (
      <Text variant="body-default-xs" onBackground="neutral-weak">
        Нет отзывов
      </Text>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Star
        className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
        aria-hidden="true"
      />
      <Text variant="label-default-s" onBackground="neutral-strong">
        {rating.toFixed(1)}
      </Text>
      <Text variant="body-default-xs" onBackground="neutral-weak">
        {formatReviewsCount(reviewsCount)}
      </Text>
    </div>
  );
}
