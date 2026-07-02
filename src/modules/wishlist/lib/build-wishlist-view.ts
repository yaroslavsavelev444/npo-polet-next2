// src/modules/wishlist/lib/build-wishlist-view.ts
import { mapProductToCardData } from '@/modules/productCard'
import type { Product, Wishlist } from '@/payload-types'
import type { WishlistItemView, WishlistView } from '../types'

function isPopulatedProduct(value: number | Product): value is Product {
  return typeof value === 'object' && value !== null
}

export const EMPTY_WISHLIST_VIEW: WishlistView = {
  items: [],
  productIds: [],
  updatedAt: null,
}

/**
 * Wishlist -> WishlistView. Unlike buildCartView, out-of-stock / preorder
 * products are intentionally KEPT — mapProductToCardData already resolves
 * their status, and ProductCard already renders the matching badge. Only
 * genuinely deleted product references (unpopulated after the depth fetch)
 * are silently skipped.
 */
export function buildWishlistView(wishlist: Wishlist | null): WishlistView {
  const rawItems = wishlist?.items ?? []

  const items: WishlistItemView[] = []
  for (const raw of rawItems) {
    if (!isPopulatedProduct(raw.product)) continue
    items.push({
      product: mapProductToCardData(raw.product),
      addedAt: raw.addedAt ?? new Date().toISOString(),
    })
  }

  return {
    items,
    productIds: items.map((i) => i.product.id),
    updatedAt: wishlist?.updatedAt ?? null,
  }
}