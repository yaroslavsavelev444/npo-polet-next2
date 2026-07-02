// src/payload/services/carts.service.ts (append to the existing file)

import { Cart } from "@/payload-types"
import { getPayloadInstance } from "./getPayload"

export async function getCartByUserId(userId: string): Promise<Cart | null> {
  const payload = await getPayloadInstance()
  const { docs } = await payload.find({
    collection: 'carts',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 2, // populate items.product AND product.images/category for pricing/UI
    overrideAccess: true,
  })
  return (docs[0] as unknown as Cart) ?? null
}

export async function getOrCreateCart(userId: string): Promise<Cart> {
  const existing = await getCartByUserId(userId)
  if (existing) return existing

  const payload = await getPayloadInstance()
  const created = await payload.create({
    collection: 'carts',
    data: { user: Number(userId), items: [] },
    overrideAccess: true,
  })
  return created as unknown as Cart
}

function serializeItems(cart: Cart) {
  return (cart.items ?? []).map((item) => ({
    product: typeof item.product === 'object' ? item.product.id : item.product,
    quantity: item.quantity,
    addedAt: item.addedAt ?? new Date().toISOString(),
  }))
}

/** Upserts a single line item to an absolute quantity. */
export async function setCartItemQuantity(
  userId: string,
  productId: string,
  quantity: number,
  existingCart?: Cart,
): Promise<Cart> {
  const payload = await getPayloadInstance()
  const cart = existingCart ?? (await getOrCreateCart(userId))
  const items = serializeItems(cart)

  const index = items.findIndex((i) => String(i.product) === String(productId))
  if (index === -1) {
    items.push({ product: Number(productId), quantity, addedAt: new Date().toISOString() })
  } else {
    items[index] = { ...items[index], quantity, addedAt: new Date().toISOString() }
  }

  const updated = await payload.update({
    collection: 'carts',
    id: cart.id,
    data: { items },
    overrideAccess: true,
  })
  return updated as unknown as Cart
}


export async function removeCartItem(userId: string, productId: string): Promise<Cart> {
  const payload = await getPayloadInstance()
  const cart = await getOrCreateCart(userId)
  const items = serializeItems(cart).filter((i) => String(i.product) !== String(productId))

  const updated = await payload.update({
    collection: 'carts',
    id: cart.id,
    data: { items },
    overrideAccess: true,
  })
  return updated as unknown as Cart
}

export async function clearCartItems(userId: string): Promise<Cart> {
  const payload = await getPayloadInstance()
  const cart = await getOrCreateCart(userId)
  const updated = await payload.update({
    collection: 'carts',
    id: cart.id,
    data: { items: [] },
    overrideAccess: true,
  })
  return updated as unknown as Cart
}

/** Lightweight count for the header badge — no discount/pricing calculation. */
export async function getCartItemCount(userId: string): Promise<number> {
  const cart = await getCartByUserId(userId)
  if (!cart?.items) return 0
  return cart.items.reduce((sum, item) => sum + item.quantity, 0)
}