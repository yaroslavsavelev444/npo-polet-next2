// modules/productCard/components/WishlistButton.tsx
'use client';

import { ProductCardData } from '@/modules/productCard';
import { useToggleWishlist } from '@/modules/productCard/hooks/useToggleWishlist';
import { Heart } from 'lucide-react';

interface WishlistButtonProps {
  product: ProductCardData;
  className?: string;
}

export function WishlistButton({ product, className = '' }: WishlistButtonProps) {
  const { isInWishlist, isToggling, toggleWishlist } = useToggleWishlist(product.id);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWishlist(product);
      }}
      disabled={isToggling}
      className={`

        flex h-9 w-9 items-center justify-center

        rounded-full

        bg-white/95

        shadow-md

        backdrop-blur-sm

        transition-all

        hover:scale-110
        z-1000

        ${isInWishlist ? "text-red-500" : "text-gray-400"}

        ${isToggling ? "opacity-50" : ""}

        ${className}

    `}
      aria-label={isInWishlist ? 'Удалить из избранного' : 'Добавить в избранное'}
    >
      <Heart
        size={20}
        fill={isInWishlist ? 'currentColor' : 'none'}
        className="transition-colors"
      />
    </button>
  );
}