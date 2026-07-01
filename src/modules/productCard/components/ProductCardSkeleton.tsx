/**
 * modules/productCard/components/ProductCardSkeleton.tsx
 *
 * Плейсхолдер карточки на время загрузки (Suspense fallback в листинге
 * каталога). Повторяет геометрию ProductCard, чтобы не было layout shift
 * после гидратации реальных данных.
 */

import { Skeleton } from "@once-ui-system/core";

export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-(--neutral-border-medium,#e5e7eb)">
      <Skeleton shape="block" className="aspect-square w-full" />
      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <Skeleton shape="line" width="s" />
        <Skeleton shape="line" width="l" />
        <Skeleton shape="line" width="m" />
        <Skeleton shape="block" height="xs" className="mt-auto" />
      </div>
    </div>
  );
}
