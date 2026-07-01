'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ImageOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useSearchStore } from '@/shared/store/search.store'
import { formatPrice } from '@/modules/productCard'
import { getSearchResultHref } from '../lib/routing'
import type { SearchResultProduct } from '../types'

interface SearchResultItemProps {
  result: SearchResultProduct
  index: number
  isActive: boolean
  onSelect: () => void
}

export function SearchResultItem({ result, index, isActive, onSelect }: SearchResultItemProps) {
  const setActiveIndex = useSearchStore((s) => s.setActiveIndex)
  const href = getSearchResultHref(result)

  return (
    <li role="presentation">
      <Link
        href={href}
        role="option"
        aria-selected={isActive}
        id={`search-result-${result.id}`}
        onClick={onSelect}
        onMouseEnter={() => setActiveIndex(index)}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150',
          isActive ? 'bg-white/10' : 'hover:bg-white/5',
        )}
      >
        {/* Товар: изображение */}
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5">
          {result.imageUrl ? (
            <Image
              src={result.imageUrl}
              alt={result.imageAlt}
              fill
              sizes="48px"
              className="object-contain p-1"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/30">
              <ImageOff className="h-4 w-4" aria-hidden />
            </div>
          )}
        </div>

        {/* Товар: название и цена */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{result.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                'font-semibold',
                result.hasDiscount ? 'text-[var(--error)]' : 'text-white/60',
              )}
            >
              {formatPrice(result.finalPrice)}
            </span>
            {result.hasDiscount && (
              <span className="text-white/35 line-through">
                {formatPrice(result.originalPrice)}
              </span>
            )}
            {result.status === 'out_of_stock' && (
              <span className="text-[var(--error)]">· Нет в наличии</span>
            )}
            {result.status === 'preorder' && (
              <span className="text-[var(--warning)]">· Предзаказ</span>
            )}
          </p>
        </div>

        {/* Категория товара */}
        {result.category && (
          <span className="max-w-[120px] shrink-0 truncate whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/60">
            {result.category.name}
          </span>
        )}
      </Link>
    </li>
  )
}