// modules/productCard/components/WishlistButton.tsx
'use client';

import { Heart } from 'lucide-react';
import { ProductCardData } from '@/modules/productCard';
import { useToggleWishlist } from '@/modules/productCard/hooks/useToggleWishlist';
import { CircleIconButton } from '@/shared/components/CircleIconButton';

interface WishlistButtonProps {
  product: ProductCardData;
  className?: string;
}

export function WishlistButton({ product, className }: WishlistButtonProps) {
  const { isInWishlist, isToggling, toggleWishlist } = useToggleWishlist(product.id);

  return (
    <CircleIconButton
      active={isInWishlist}
      disabled={isToggling}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWishlist(product);
      }}
      aria-label={isInWishlist ? 'Удалить из избранного' : 'Добавить в избранное'}
      className={className}
    >
      <Heart size={18} fill={isInWishlist ? 'currentColor' : 'none'} aria-hidden="true" />
    </CircleIconButton>
  );
}
