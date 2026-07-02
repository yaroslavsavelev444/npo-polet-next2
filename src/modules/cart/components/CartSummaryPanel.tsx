// src/modules/cart/components/CartSummaryPanel.tsx
'use client'

import { CheckCircle2 } from 'lucide-react'
import { Button, Tooltip } from '@/UI'
import { formatPrice } from '@/modules/productCard'
import type { CartSummary } from '../types'

interface CartSummaryPanelProps {
  summary: CartSummary
  isValid: boolean
  onCheckout: () => void
}

export function CartSummaryPanel({ summary, isValid, onCheckout }: CartSummaryPanelProps) {
  const hasDiscount = summary.totalDiscount > 0

  const checkoutButton = (
    <Button
      variant="primary"
      size="lg"
      fullWidth
      disabled={!isValid}
      onClick={onCheckout}
      leftIcon={<CheckCircle2 className="h-4 w-4" />}
    >
      {isValid ? 'Перейти к оформлению' : 'Нельзя оформить'}
    </Button>
  )

  return (
    <div className="sticky top-24 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">Итог заказа</h2>

      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">Товары ({summary.totalItems} шт.)</span>
        <span className="font-medium text-[var(--text-primary)]">{formatPrice(summary.priceWithoutDiscount)}</span>
      </div>

      {hasDiscount && (
        <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-[var(--success)]/10 px-3 py-2 text-sm">
          <span className="text-[var(--success)]">Скидка</span>
          <span className="font-medium text-[var(--success)]">-{formatPrice(summary.totalDiscount)}</span>
        </div>
      )}

      <div className="h-px bg-[var(--border)]" />

      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold text-[var(--text-primary)]">Итого</span>
        <span className="text-2xl font-bold text-[var(--primary)]">{formatPrice(summary.totalPrice)}</span>
      </div>

      {isValid ? (
        checkoutButton
      ) : (
        <Tooltip content="Увеличьте количество товаров до минимального заказа">{checkoutButton}</Tooltip>
      )}
    </div>
  )
}