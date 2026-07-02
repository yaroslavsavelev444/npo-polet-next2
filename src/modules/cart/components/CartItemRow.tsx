// src/modules/cart/components/CartItemRow.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Minus, Plus, Trash2, ImageOff } from 'lucide-react'
import { Badge } from '@/UI'
import { formatPrice, getProductHref } from '@/modules/productCard'
import type { CartItemView } from '../types'

interface CartItemRowProps {
  item: CartItemView
  isPending: boolean
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}

export function CartItemRow({ item, isPending, onQuantityChange, onRemove }: CartItemRowProps) {
  const { product, subtotal, subtotalWithoutDiscount, itemDiscount } = item
  const [localQuantity, setLocalQuantity] = useState(item.quantity)
  const hasDiscount = itemDiscount > 0
  const isOutOfStock = product.status === 'out_of_stock'
  const image = product.images[0]
  const href = getProductHref(product)

  function commit(value: number) {
    const clamped = Math.max(1, Math.min(value, product.maxOrderQuantity))
    setLocalQuantity(clamped)
    if (clamped !== item.quantity) onQuantityChange(clamped)
  }

  return (
    <div className="flex gap-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <Link
        href={href}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-secondary)]"
      >
        {image ? (
          <Image src={image.url} alt={image.alt || product.title} fill sizes="96px" className="object-contain p-2" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={href}
              className="line-clamp-2 text-sm font-medium text-[var(--text-primary)] hover:text-[var(--primary)]"
            >
              {product.title}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {isOutOfStock && <Badge variant="danger" size="sm">Нет в наличии</Badge>}
              {product.minOrderQuantity > 1 && (
                <Badge variant="outline" size="sm">Мин. {product.minOrderQuantity} шт.</Badge>
              )}
              {hasDiscount && <Badge variant="success" size="sm">Скидка</Badge>}
            </div>
          </div>

          <button
            type="button"
            onClick={onRemove}
            disabled={isPending}
            aria-label="Удалить товар"
            className="shrink-0 rounded-[var(--radius-sm)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--error)]/10 hover:text-[var(--error)] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex h-9 items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)]">
            <button
              type="button"
              onClick={() => commit(localQuantity - 1)}
              disabled={isPending || localQuantity <= 1}
              className="flex h-full w-8 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              min={1}
              max={product.maxOrderQuantity}
              value={localQuantity}
              disabled={isPending}
              onChange={(e) => setLocalQuantity(Number(e.target.value) || 1)}
              onBlur={(e) => commit(Number(e.target.value) || 1)}
              className="h-full w-12 border-x border-[var(--border)] bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => commit(localQuantity + 1)}
              disabled={isPending || localQuantity >= product.maxOrderQuantity}
              className="flex h-full w-8 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="text-right">
            {hasDiscount && (
              <p className="text-xs text-[var(--text-muted)] line-through">{formatPrice(subtotalWithoutDiscount)}</p>
            )}
            <p className="text-base font-semibold text-[var(--primary)]">{formatPrice(subtotal)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}