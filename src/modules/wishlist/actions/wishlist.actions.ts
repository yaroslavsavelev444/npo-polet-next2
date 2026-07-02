// src/modules/wishlist/actions/wishlist.actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/modules/auth/lib/getCurrentUser'
import { getCachedProductById } from '@/payload/services/products.service'
import {
  getWishlistByUserId,
  addWishlistItem,
  removeWishlistItem,
  clearWishlistItems,
  isProductInWishlist,
} from '@/payload/services/wishlists.service'
import type { WishlistActionErrorCode, WishlistActionResult } from '../types'

function failure(error: WishlistActionErrorCode, message: string): WishlistActionResult {
  return { success: false, error, message }
}

/**
 * Adds or removes a product from the current user's wishlist. This is the
 * single entry point used by the heart icon everywhere in the app —
 * including on the Wishlist page itself, where un-hearting a product is
 * how it's "removed" (see WishlistPageClient for the reactive filtering).
 *
 * Deliberately does NOT check product availability/visibility like
 * addToCartAction does — the whole point of a wishlist is to let people
 * track items that are currently out of stock.
 */
export async function toggleWishlistAction(productId: string): Promise<WishlistActionResult> {
  const user = await getCurrentUser()
  if (!user) return failure('AUTH_REQUIRED', 'Войдите в аккаунт, чтобы добавить товар в избранное')

  const product = await getCachedProductById(productId)
  if (!product) return failure('PRODUCT_UNAVAILABLE', 'Товар не найден')

  const wishlist = await getWishlistByUserId(String(user.id))
  const alreadyFavorite = isProductInWishlist(wishlist, productId)

  const updated = alreadyFavorite
    ? await removeWishlistItem(String(user.id), productId, wishlist)
    : await addWishlistItem(String(user.id), productId, wishlist)

  revalidatePath('/wishlist')

  return {
    success: true,
    data: { isFavorite: !alreadyFavorite, itemCount: updated.items?.length ?? 0 },
  }
}

export async function clearWishlistAction(): Promise<WishlistActionResult> {
  const user = await getCurrentUser()
  if (!user) return failure('AUTH_REQUIRED', 'Войдите в аккаунт')

  await clearWishlistItems(String(user.id))
  revalidatePath('/wishlist')

  return { success: true, data: { isFavorite: false, itemCount: 0 } }
}