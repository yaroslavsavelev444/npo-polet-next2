// src/modules/cart/components/DiscountBanner.tsx
import { Gift, Flame } from 'lucide-react'
import type { CartView } from '../types'

interface DiscountBannerProps {
  discounts: CartView['discounts']
}

export function DiscountBanner({ discounts }: DiscountBannerProps) {
  const { applied, hints } = discounts
  if (applied.length === 0 && hints.length === 0) return null

  if (applied.length > 0) {
    const discount = applied[0]
    return (
      <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--success)]/30 bg-[var(--success)]/10 p-4">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" />
        <div>
          <p className="text-sm font-semibold text-[var(--success)]">{discount.message}</p>
          {discount.discountPercent > 0 && (
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Ваша скидка: {discount.discountPercent}%
            </p>
          )}
        </div>
      </div>
    )
  }

  const hint = hints[0]
  const progress =
    hint.needed?.quantity !== undefined && hint.current?.quantity !== undefined
      ? Math.min(100, (hint.current.quantity / (hint.current.quantity + hint.needed.quantity)) * 100)
      : null

  return (
    <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-4">
      <Flame className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{hint.message}</p>
        {progress !== null && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}