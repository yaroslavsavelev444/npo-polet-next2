// src/modules/wishlist/types/index.ts
import type { ProductCardData } from '@/modules/productCard'

export interface WishlistItemView {
  product: ProductCardData
  addedAt: string
}

export interface WishlistView {
  items: WishlistItemView[]
  productIds: string[]
  updatedAt: string | null
}

export type WishlistActionErrorCode = 'AUTH_REQUIRED' | 'PRODUCT_UNAVAILABLE' | 'UNKNOWN'

export interface WishlistToggleData {
  isFavorite: boolean
  itemCount: number
}

export type WishlistActionResult =
  | { success: true; data: WishlistToggleData }
  | { success: false; error: WishlistActionErrorCode; message: string }