// src/payload/services/wishlist.service.ts
import { getPayloadInstance } from './getPayload'
import type { Wishlist } from '@/payload-types'

export async function getWishlistByUserId(userId: string): Promise<Wishlist | null> {
  const payload = await getPayloadInstance()
  const { docs } = await payload.find({
    collection: 'wishlists',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 2, // populate items.product AND product.images/category for the page view
    overrideAccess: true,
  })
  return (docs[0] as unknown as Wishlist) ?? null
}

export async function getOrCreateWishlist(userId: string): Promise<Wishlist> {
  const existing = await getWishlistByUserId(userId)
  if (existing) return existing

  const payload = await getPayloadInstance()
  const created = await payload.create({
    collection: 'wishlists',
    data: { user: Number(userId), items: [] },
    overrideAccess: true,
  })
  return created as unknown as Wishlist
}

function serializeItems(wishlist: Wishlist) {
  return (wishlist.items ?? []).map((item) => ({
    product: typeof item.product === 'object' ? item.product.id : item.product,
    addedAt: item.addedAt ?? new Date().toISOString(),
  }))
}

export function isProductInWishlist(wishlist: Wishlist | null, productId: string): boolean {
  if (!wishlist?.items) return false
  return wishlist.items.some(
    (item) => String(typeof item.product === 'object' ? item.product.id : item.product) === String(productId),
  )
}

export async function addWishlistItem(
  userId: string,
  productId: string,
  existingWishlist?: Wishlist | null,
): Promise<Wishlist> {
  const payload = await getPayloadInstance()
  const wishlist = existingWishlist ?? (await getOrCreateWishlist(userId))
  const items = serializeItems(wishlist)

  if (items.some((i) => String(i.product) === String(productId))) return wishlist

  items.push({ product: Number(productId), addedAt: new Date().toISOString() })

  const updated = await payload.update({
    collection: 'wishlists',
    id: wishlist.id,
    data: { items },
    overrideAccess: true,
  })
  return updated as unknown as Wishlist
}

export async function removeWishlistItem(
  userId: string,
  productId: string,
  existingWishlist?: Wishlist | null,
): Promise<Wishlist> {
  const payload = await getPayloadInstance()
  const wishlist = existingWishlist ?? (await getOrCreateWishlist(userId))
  const items = serializeItems(wishlist).filter((i) => String(i.product) !== String(productId))

  const updated = await payload.update({
    collection: 'wishlists',
    id: wishlist.id,
    data: { items },
    overrideAccess: true,
  })
  return updated as unknown as Wishlist
}

export async function clearWishlistItems(userId: string): Promise<Wishlist> {
  const payload = await getPayloadInstance()
  const wishlist = await getOrCreateWishlist(userId)
  const updated = await payload.update({
    collection: 'wishlists',
    id: wishlist.id,
    data: { items: [] },
    overrideAccess: true,
  })
  return updated as unknown as Wishlist
}

/**
 * Lightweight ID-only fetch (depth 0) for Navbar hydration and the heart
 * icons — deliberately separate from getWishlistByUserId so we don't pay
 * for a depth-2 product/category/image populate on every page load just
 * to render a badge count.
 */
export async function getWishlistProductIds(userId: string): Promise<string[]> {
  const payload = await getPayloadInstance()
  const { docs } = await payload.find({
    collection: 'wishlists',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const wishlist = docs[0] as unknown as Wishlist | undefined
  if (!wishlist?.items) return []
  return wishlist.items.map((item) => String(item.product))
}