// src/modules/cart/types/index.ts
import type { ProductCardData } from '@/modules/productCard'

export interface CartItemView {
  product: ProductCardData
  quantity: number
  addedAt: string
  unitPrice: number
  unitFinalPrice: number
  subtotal: number
  subtotalWithoutDiscount: number
  itemDiscount: number
}

export interface CartValidationIssue {
  productId: string
  productTitle: string
  currentQuantity: number
  minOrderQuantity: number
  message: string
}

export interface CartSummary {
  totalItems: number
  itemsCount: number
  priceWithoutDiscount: number
  productDiscountAmount: number
  centralDiscountAmount: number
  centralDiscountPercent: number
  totalDiscount: number
  totalPrice: number
}

export interface AppliedDiscount {
  id: string
  name: string
  discountPercent: number
  amount: number
  message: string
}

export interface DiscountHint {
  message: string
  needed?: { quantity?: number; amount?: number }
  current?: { quantity?: number; amount?: number }
}

export interface CartView {
  items: CartItemView[]
  summary: CartSummary
  validation: { isValid: boolean; issues: CartValidationIssue[] }
  discounts: { applied: AppliedDiscount[]; hints: DiscountHint[] }
  updatedAt: string | null
}

export type CartActionErrorCode =
  | 'AUTH_REQUIRED'
  | 'PRODUCT_UNAVAILABLE'
  | 'MAX_QUANTITY_EXCEEDED'
  | 'UNKNOWN'

export type CartActionResult =
  | { success: true; data: CartView }
  | { success: false; error: CartActionErrorCode; message: string }