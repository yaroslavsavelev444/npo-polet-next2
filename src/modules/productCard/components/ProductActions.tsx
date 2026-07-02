// modules/productCard/components/ProductActions.tsx
'use client';

import { Eye } from 'lucide-react';
import { IconButton } from '@once-ui-system/core';
import type { ProductActionsProps, ProductCardData } from '../types';
import { WishlistButton } from '@/modules/wishlist/components/WishlistButton';

interface Props extends ProductActionsProps {
  product: ProductCardData;
}

export function ProductActions({ product, showQuickView, onQuickView }: Props) {
  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onQuickView?.();
  };
console.log(product);
  return (
   <div

    className="

        absolute

        right-3

        top-3

        z-30

        flex

        flex-col

        gap-2

        opacity-100

        transition-opacity

        duration-200

        group-hover:opacity-100

        max-md:opacity-100

    "

>
      <WishlistButton product={product} />

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