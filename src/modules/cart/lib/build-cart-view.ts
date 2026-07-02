// src/modules/cart/lib/build-cart-view.ts
import { mapProductToCardData, calculatePriceBreakdown } from '@/modules/productCard'
import { getApplicableDiscount } from '@/payload/services/discounts.service'
import type { Cart, Product } from '@/payload-types'
import type { CartItemView, CartSummary, CartValidationIssue, CartView } from '../types'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function isPopulatedProduct(value: number | Product): value is Product {
  return typeof value === 'object' && value !== null
}

export const EMPTY_CART_VIEW: CartView = {
  items: [],
  summary: {
    totalItems: 0,
    itemsCount: 0,
    priceWithoutDiscount: 0,
    productDiscountAmount: 0,
    centralDiscountAmount: 0,
    centralDiscountPercent: 0,
    totalDiscount: 0,
    totalPrice: 0,
  },
  validation: { isValid: true, issues: [] },
  discounts: { applied: [], hints: [] },
  updatedAt: null,
}

/**
 * Cart -> CartView. The one place that turns a raw Payload document into
 * everything the UI needs: normalized products (reusing the productCard
 * adapter), per-item pricing, cart-level discount, and validation.
 */
export async function buildCartView(cart: Cart | null): Promise<CartView> {
  const rawItems = cart?.items ?? []

  const items: CartItemView[] = []
  const issues: CartValidationIssue[] = []
  let priceWithoutDiscount = 0
  let priceAfterProductDiscounts = 0
  let totalQuantity = 0

  for (const raw of rawItems) {
    if (!isPopulatedProduct(raw.product)) continue

    const product = raw.product
    const status = product.inventory?.status ?? 'available'
    const isVisible = product.inventory?.isVisible ?? true
    // Товары, снятые с публикации/продажи, молча исключаются из расчёта —
    // как и в старой системе (itemsToUpdate). Полную зачистку неактуальных
    // позиций делает Server Action при следующем изменении корзины.
    if (!isVisible || !['available', 'preorder'].includes(status)) continue

    const cardData = mapProductToCardData(product)
    const quantity = raw.quantity
    const { finalPrice } = calculatePriceBreakdown(cardData.priceForIndividual, cardData.discount)

    const subtotalWithoutDiscount = roundMoney(cardData.priceForIndividual * quantity)
    const subtotal = roundMoney(finalPrice * quantity)
    const itemDiscount = roundMoney(subtotalWithoutDiscount - subtotal)

    priceWithoutDiscount = roundMoney(priceWithoutDiscount + subtotalWithoutDiscount)
    priceAfterProductDiscounts = roundMoney(priceAfterProductDiscounts + subtotal)
    totalQuantity += quantity

    if (cardData.minOrderQuantity && quantity < cardData.minOrderQuantity) {
      issues.push({
        productId: cardData.id,
        productTitle: cardData.title,
        currentQuantity: quantity,
        minOrderQuantity: cardData.minOrderQuantity,
        message: `Минимальное количество для заказа: ${cardData.minOrderQuantity} шт.`,
      })
    }

    items.push({
      product: cardData,
      quantity,
      addedAt: raw.addedAt ?? new Date().toISOString(),
      unitPrice: cardData.priceForIndividual,
      unitFinalPrice: finalPrice,
      subtotal,
      subtotalWithoutDiscount,
      itemDiscount,
    })
  }

  const { applied, hints } = await getApplicableDiscount({
    totalAmount: priceAfterProductDiscounts,
    totalQuantity,
  })

  const centralDiscountAmount = applied?.discountAmount ?? 0
  const totalPrice = roundMoney(priceAfterProductDiscounts - centralDiscountAmount)
  const productDiscountAmount = roundMoney(priceWithoutDiscount - priceAfterProductDiscounts)
  const totalDiscount = roundMoney(productDiscountAmount + centralDiscountAmount)

  const summary: CartSummary = {
    totalItems: totalQuantity,
    itemsCount: items.length,
    priceWithoutDiscount,
    productDiscountAmount,
    centralDiscountAmount,
    centralDiscountPercent: applied?.discountPercent ?? 0,
    totalDiscount,
    totalPrice,
  }

  return {
    items,
    summary,
    validation: { isValid: issues.length === 0, issues },
    discounts: {
      applied: applied
        ? [
            {
              id: String(applied.discount.id),
              name: applied.discount.name,
              discountPercent: applied.discountPercent,
              amount: applied.discountAmount,
              message: applied.message,
            },
          ]
        : [],
      hints: hints.map((h) => ({ message: h.message, needed: h.needed, current: h.current })),
    },
    updatedAt: cart?.updatedAt ?? null,
  }
}