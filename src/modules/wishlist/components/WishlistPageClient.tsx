"use client";

import { Heart } from "lucide-react";
import { useEffect, useTransition } from "react";
import { ProductListContainer } from "@/modules/productCard/components/ProductListContainer";
import { useWishlistStore } from "@/shared/store/wishlist.store";
import { Button } from "@/UI";
import { clearWishlistAction } from "../actions/wishlist.actions";
import type { WishlistView } from "../types";
import { WishlistEmptyState } from "./WishlistEmptyState";

interface WishlistPageClientProps {
  initialWishlist: WishlistView;
}

/**
 * The store's productIds Set is the single source of truth for membership.
 * There's no dedicated "remove" action here: un-hearting a product via its
 * ProductCard (the same heart used everywhere) updates the store, and the
 * grid below reactively drops that item — no extra round trip, no
 * duplicated removal UI.
 */
export function WishlistPageClient({
  initialWishlist,
}: WishlistPageClientProps) {
  const hydrate = useWishlistStore((s) => s.hydrate);
  const clear = useWishlistStore((s) => s.clear);
  const favoriteIds = useWishlistStore((s) => s.productIds);
  const [isClearing, startClearing] = useTransition();

  useEffect(() => {
    hydrate(initialWishlist.productIds);
  }, [initialWishlist, hydrate]);

  const visibleItems = initialWishlist.items.filter((item) =>
    favoriteIds.has(item.product.id),
  );

  function handleClear() {
    startClearing(async () => {
      const result = await clearWishlistAction();
      if (result.success) clear();
    });
  }

  if (visibleItems.length === 0) {
    return <WishlistEmptyState />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">
            <Heart className="h-6 w-6" />
            Избранное
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {visibleItems.length} товаров
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          loading={isClearing}
          disabled={isClearing}
        >
          Очистить избранное
        </Button>
      </div>

      <ProductListContainer
        products={visibleItems.map((item) => item.product)}
        totalProducts={visibleItems.length}
      />
    </div>
  );
}
