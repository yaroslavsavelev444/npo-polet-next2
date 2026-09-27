'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ImageOff } from 'lucide-react'
import { cn } from '@/utils/cn'
import { HighlightedText } from '@/modules/knowledge/components/HighlightedText'
import { formatPrice } from '@/modules/productCard'
import { optionId } from '../lib/entries'
import type { SearchResultProduct } from '../types'

interface SearchResultItemProps {
  result: SearchResultProduct
  entryKey: string
  terms: string[]
  isActive: boolean
  onHover: (key: string) => void
  onSelect: () => void
}

/**
 * Товар в выдаче: фото, название, цена, наличие, категория. Если товар
 * нашёлся по характеристике, она стоит строкой под названием — иначе
 * непонятно, почему на запрос «IP67» показан «Вултур».
 */
export function SearchResultItem({
  result,
  entryKey,
  terms,
  isActive,
  onHover,
  onSelect,
}: SearchResultItemProps) {
  const spec = result.matchedSpec

  return (
    <li role="presentation">
      <Link
        href={result.href}
        role="option"
        aria-selected={isActive}
        id={optionId(entryKey)}
        tabIndex={-1}
        onClick={onSelect}
        onMouseMove={() => onHover(entryKey)}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-150',
          isActive ? 'bg-[var(--text-primary)]/10' : 'hover:bg-[var(--text-primary)]/5',
        )}
      >
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/5">
          {result.imageUrl ? (
            <Image
              src={result.imageUrl}
              alt={result.imageAlt}
              fill
              sizes="48px"
              className="object-contain p-1"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[color:var(--text-primary)]/30">
              <ImageOff className="h-4 w-4" aria-hidden />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-[color:var(--text-primary)] sm:line-clamp-1">
            <HighlightedText text={result.title} terms={terms} />
          </p>

          {spec && (
            <p className="mt-0.5 truncate text-xs text-[color:var(--text-primary)]/55">
              {spec.name}:{' '}
              <span className="text-[color:var(--text-primary)]/80">
                <HighlightedText text={spec.value} terms={terms} />
                {spec.unit ? ` ${spec.unit}` : ''}
              </span>
            </p>
          )}

          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
            <span
              className={cn(
                'font-semibold',
                result.hasDiscount ? 'text-[var(--error)]' : 'text-[color:var(--text-primary)]/70',
              )}
            >
              {formatPrice(result.finalPrice)}
            </span>
            {result.hasDiscount && (
              <span className="text-[color:var(--text-primary)]/35 line-through">
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

        {result.category && (
          <span className="hidden max-w-[140px] shrink-0 truncate whitespace-nowrap rounded-full border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/5 px-2.5 py-1 text-xs font-medium text-[color:var(--text-primary)]/60 sm:inline-block">
            {result.category.name}
          </span>
        )}
      </Link>
    </li>
  )
}
