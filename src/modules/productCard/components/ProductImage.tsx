'use client';

import Image from 'next/image';
import { ShoppingCart } from "lucide-react";
import type { ProductImageProps } from "../types";

function getImageUrl(media: unknown): string | null {
  if (!media) return null;
  if (typeof media === 'object' && media !== null) {
    // Прямой url
    if ('url' in media && typeof (media as any).url === 'string') {
      return (media as any).url;
    }
    // Вложенный image.url
    if ('image' in media && (media as any).image && typeof (media as any).image === 'object') {
      const img = (media as any).image;
      if ('url' in img && typeof img.url === 'string') {
        return img.url;
      }
    }
  }
  return null;
}

export function ProductImage({
  images,
  productId,
  hasDiscount,
  discountPercentage,
  priority = false,
}: ProductImageProps) {
  console.log('ProductImage', { images, productId, hasDiscount, discountPercentage, priority });

  const firstMedia = images?.[0];
  const imageUrl = getImageUrl(firstMedia);

  let imageAlt = `Изображение товара ${productId}`;
  if (firstMedia && typeof firstMedia === 'object') {
    if ('alt' in firstMedia && typeof firstMedia.alt === 'string') {
      imageAlt = firstMedia.alt;
    } else if ('image' in firstMedia && firstMedia.image && typeof firstMedia.image === 'object' && 'alt' in firstMedia.image) {
      imageAlt = (firstMedia.image as any).alt || imageAlt;
    }
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden bg-[var(--surface-background)]">
      {hasDiscount && discountPercentage && (
        <span className="absolute left-2 top-2 z-10 rounded-md bg-[var(--danger-solid-strong,#dc2626)] px-2 py-1 text-xs font-bold text-white shadow-sm">
          -{discountPercentage}%
        </span>
      )}

      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          priority={priority}
          className="object-contain transition-transform duration-300 ease-out group-hover:scale-105"
          // Дополнительно: улучшаем качество загрузки
          quality={85}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ShoppingCart
            className="h-10 w-10 text-[var(--neutral-on-background-weak,#9ca3af)]"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}