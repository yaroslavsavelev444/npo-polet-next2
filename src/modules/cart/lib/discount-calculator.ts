// src/modules/cart/lib/discount-calculator.ts
import type { Discount } from '@/payload-types'

export interface DiscountCalcInput {
  totalAmount: number
  totalQuantity: number
}

export interface DiscountCalcResult {
  applicable: boolean
  discountAmount: number
  discountPercent: number
  message: string
  needed?: { quantity?: number; amount?: number }
  current?: { quantity?: number; amount?: number }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function pluralizeUnits(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return 'штук'
  if (mod10 === 1) return 'штуку'
  if (mod10 >= 2 && mod10 <= 4) return 'штуки'
  return 'штук'
}

const rubFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
function formatRub(value: number): string {
  return `${rubFormatter.format(Math.round(value))} ₽`
}

export function isDiscountCurrentlyActive(discount: Discount, now: Date = new Date()): boolean {
  if (!discount.isActive) return false
  if (discount.startAt && now < new Date(discount.startAt)) return false
  if (!discount.isUnlimited && discount.endAt && now > new Date(discount.endAt)) return false
  return true
}

/**
 * Pure function mirroring the old Mongoose `Discount.calculateDiscount()` method.
 * No I/O, no Payload access — fully unit-testable and reusable from the cart
 * summary today and from checkout/order pricing tomorrow.
 */
export function calculateDiscount(discount: Discount, input: DiscountCalcInput): DiscountCalcResult {
  const discountPercent = discount.discountPercent ?? 0

  if (!isDiscountCurrentlyActive(discount)) {
    return { applicable: false, discountAmount: 0, discountPercent, message: '' }
  }

  const { totalAmount, totalQuantity } = input

  if (discount.minTotalQuantity && totalQuantity < discount.minTotalQuantity) {
    const needed = discount.minTotalQuantity - totalQuantity
    return {
      applicable: false,
      discountAmount: 0,
      discountPercent,
      message: `Добавьте ещё ${needed} ${pluralizeUnits(needed)} — и скидка ${discountPercent}% станет доступна`,
      needed: { quantity: needed },
      current: { quantity: totalQuantity },
    }
  }

  if (discount.minTotalAmount && totalAmount < discount.minTotalAmount) {
    const needed = roundMoney(discount.minTotalAmount - totalAmount)
    return {
      applicable: false,
      discountAmount: 0,
      discountPercent,
      message: `Добавьте товаров ещё на ${formatRub(needed)} — и скидка ${discountPercent}% станет доступна`,
      needed: { amount: needed },
      current: { amount: totalAmount },
    }
  }

  if (discount.type === 'fixed') {
    const discountAmount = roundMoney(discount.fixedAmount ?? 0)
    return {
      applicable: true,
      discountAmount,
      discountPercent,
      message: `Скидка ${formatRub(discountAmount)} применена`,
    }
  }

  const discountAmount = roundMoney(totalAmount * (discountPercent / 100))
  return {
    applicable: true,
    discountAmount,
    discountPercent,
    message: `Скидка ${discountPercent}% применена`,
  }
}

export interface DiscountApplication extends DiscountCalcResult {
  discount: Discount
}

/**
 * Discounts are expected sorted by priority (desc) already — takes the first
 * applicable one and collects hints for the rest, matching the old
 * "first-match-wins" behaviour.
 */
export function pickApplicableDiscount(
  discounts: Discount[],
  input: DiscountCalcInput,
): { applied: DiscountApplication | null; hints: DiscountApplication[] } {
  const hints: DiscountApplication[] = []

  for (const discount of discounts) {
    const result = calculateDiscount(discount, input)
    if (result.applicable) {
      return { applied: { ...result, discount }, hints }
    }
    if (result.message) hints.push({ ...result, discount })
  }

  return { applied: null, hints }
}