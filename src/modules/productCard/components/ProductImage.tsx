'use client';

import Image from 'next/image';
import { Ban, Clock, ShoppingCart } from 'lucide-react';
import { cn } from '@/utils/cn';
import { PRODUCT_STATUS_LABELS } from '../lib/status';
import type { ProductImageProps } from '../types';

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
  status,
  priority = false,
}: ProductImageProps) {
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

  const isUnavailable = status === 'out_of_stock' || status === 'discontinued';
  const isPreorder = status === 'preorder';

  return (
    <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[var(--surface-secondary)]">
      {(hasDiscount || isPreorder) && (
        <div className="absolute left-2 top-2 z-10 flex flex-col items-start gap-1">
          {hasDiscount && discountPercentage ? (
            <span className="rounded-[var(--radius-sm)] bg-[var(--error)] px-2 py-1 text-xs font-bold leading-none text-white shadow-sm">
              -{discountPercentage}%
            </span>
          ) : null}
          {isPreorder && (
            <span className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--warning)] px-2 py-1 text-xs font-semibold leading-none text-[var(--text-dark)] shadow-sm">
              <Clock size={12} aria-hidden="true" />
              {PRODUCT_STATUS_LABELS.preorder}
            </span>
          )}
        </div>
      )}

      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          preload={priority}
          quality={85}
          className={cn(
            'object-contain p-4 transition-transform duration-300 ease-out',
            isUnavailable ? 'opacity-40 grayscale' : 'group-hover:!scale-[1.03]',
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ShoppingCart className="h-10 w-10 text-[var(--text-muted)]" aria-hidden="true" />
        </div>
      )}

      {isUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-[var(--surface)]/95 px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] shadow-[0_2px_10px_var(--shadow-color)]">
            <Ban size={13} aria-hidden="true" />
            {PRODUCT_STATUS_LABELS[status]}
          </span>
        </div>
      )}

      {!isUnavailable && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-2 opacity-0 transition-opacity duration-200 group-hover:!opacity-100"
        >
          <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-[var(--primary)]" />
          <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-[var(--primary)]" />
          <span className="absolute bottom-0 left-0 h-3 w-3 border-b-2 border-l-2 border-[var(--primary)]" />
          <span className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-[var(--primary)]" />
        </div>
      )}
    </div>
  );
}
