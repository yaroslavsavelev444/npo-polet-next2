// src/modules/cart/actions/cart.actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/modules/auth/lib/getCurrentUser'
import { getCachedProductById } from '@/payload/services/products.service'
import {
  getCartByUserId,
  setCartItemQuantity,
  removeCartItem,
  clearCartItems,
} from '@/payload/services/carts.service'
import { buildCartView, EMPTY_CART_VIEW } from '../lib/build-cart-view'
import type { CartActionErrorCode, CartActionResult } from '../types'

async function requireUser() {
  return getCurrentUser()
}

function failure(error: CartActionErrorCode, message: string): CartActionResult {
  return { success: false, error, message }
}

async function successForUser(userId: string): Promise<CartActionResult> {
  const cart = await getCartByUserId(userId)
  return { success: true, data: await buildCartView(cart) }
}

export async function addToCartAction(productId: string, quantity = 1): Promise<CartActionResult> {
  const user = await requireUser()
  if (!user) return failure('AUTH_REQUIRED', 'Войдите в аккаунт, чтобы добавить товар в корзину')

  const product = await getCachedProductById(productId)
  const status = product?.inventory?.status ?? 'available'
  if (!product || !product.inventory?.isVisible || !['available', 'preorder'].includes(status)) {
    return failure('PRODUCT_UNAVAILABLE', 'Товар недоступен для заказа')
  }

  const existingCart = await getCartByUserId(String(user.id))
  const existingItem = existingCart?.items?.find(
    (i) => String(typeof i.product === 'object' ? i.product.id : i.product) === String(productId),
  )
  const nextQuantity = (existingItem?.quantity ?? 0) + quantity

  const maxOrderQuantity = product.inventory?.maxOrderQuantity
  if (maxOrderQuantity && nextQuantity > maxOrderQuantity) {
    return failure('MAX_QUANTITY_EXCEEDED', `Максимальное количество для заказа: ${maxOrderQuantity} шт.`)
  }

  await setCartItemQuantity(String(user.id), productId, nextQuantity)
  revalidatePath('/cart')
  return successForUser(String(user.id))
}

export async function updateCartItemQuantityAction(
  productId: string,
  quantity: number,
): Promise<CartActionResult> {
  const user = await requireUser()
  if (!user) return failure('AUTH_REQUIRED', 'Войдите в аккаунт')

  if (quantity < 1) {
    return removeFromCartAction(productId)
  }

  const product = await getCachedProductById(productId)
  const maxOrderQuantity = product?.inventory?.maxOrderQuantity
  if (maxOrderQuantity && quantity > maxOrderQuantity) {
    return failure('MAX_QUANTITY_EXCEEDED', `Максимальное количество для заказа: ${maxOrderQuantity} шт.`)
  }

  await setCartItemQuantity(String(user.id), productId, quantity)
  revalidatePath('/cart')
  return successForUser(String(user.id))
}

export async function removeFromCartAction(productId: string): Promise<CartActionResult> {
  const user = await requireUser()
  if (!user) return failure('AUTH_REQUIRED', 'Войдите в аккаунт')

  await removeCartItem(String(user.id), productId)
  revalidatePath('/cart')
  return successForUser(String(user.id))
}

export async function clearCartAction(): Promise<CartActionResult> {
  const user = await requireUser()
  if (!user) return failure('AUTH_REQUIRED', 'Войдите в аккаунт')

  await clearCartItems(String(user.id))
  revalidatePath('/cart')
  return successForUser(String(user.id))
}

export async function getCartViewAction(): Promise<CartActionResult> {
  const user = await requireUser()
  if (!user) return { success: true, data: EMPTY_CART_VIEW }
  return successForUser(String(user.id))
}