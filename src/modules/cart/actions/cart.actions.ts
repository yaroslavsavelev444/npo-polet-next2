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

// Верхняя граница на позицию в корзине. Ниже по потоку количество умножается
// на цену и попадает в заказ, поэтому дробное/огромное/NaN значение из клиента
// не должно доходить до БД: клиентский <input type="number"> ничего не
// гарантирует, а Server Action вызывается и напрямую.
const MAX_ITEM_QUANTITY = 1000

function normalizeQuantity(quantity: number): number | null {
  if (!Number.isSafeInteger(quantity)) return null
  if (quantity > MAX_ITEM_QUANTITY) return null
  return quantity
}

/** Идентификатор товара в этой схеме — числовой id Payload. */
function normalizeProductId(productId: string): string | null {
  const numeric = Number(productId)
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return null
  return String(numeric)
}


async function successForUser(userId: string): Promise<CartActionResult> {
  const cart = await getCartByUserId(userId)
  return { success: true, data: await buildCartView(cart) }
}

export async function addToCartAction(productId: string, quantity = 1): Promise<CartActionResult> {
  const user = await requireUser()
  if (!user) return failure('AUTH_REQUIRED', 'Войдите в аккаунт, чтобы добавить товар в корзину')

  const id = normalizeProductId(productId)
  const amount = normalizeQuantity(quantity)
  if (!id || amount === null || amount < 1) {
    return failure('PRODUCT_UNAVAILABLE', 'Некорректное количество товара')
  }
  productId = id
  quantity = amount

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

  // Накопительная граница: без неё повторные добавления обходили бы
  // MAX_ITEM_QUANTITY, когда у товара не задан свой maxOrderQuantity.
  if (nextQuantity > MAX_ITEM_QUANTITY) {
    return failure('MAX_QUANTITY_EXCEEDED', `Максимальное количество для заказа: ${MAX_ITEM_QUANTITY} шт.`)
  }

  const maxOrderQuantity = product.inventory?.maxOrderQuantity
  if (maxOrderQuantity && nextQuantity > maxOrderQuantity) {
    return failure('MAX_QUANTITY_EXCEEDED', `Максимальное количество для заказа: ${maxOrderQuantity} шт.`)
  }

  // Reuse the cart we already fetched above instead of fetching it again inside the service.
  await setCartItemQuantity(String(user.id), productId, nextQuantity, existingCart ?? undefined)
  revalidatePath('/cart')
  return successForUser(String(user.id))
}


export async function updateCartItemQuantityAction(
  productId: string,
  quantity: number,
): Promise<CartActionResult> {
  const user = await requireUser()
  if (!user) return failure('AUTH_REQUIRED', 'Войдите в аккаунт')

  const id = normalizeProductId(productId)
  const amount = normalizeQuantity(quantity)
  if (!id || amount === null) {
    return failure('PRODUCT_UNAVAILABLE', 'Некорректное количество товара')
  }
  productId = id
  quantity = amount

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

  const id = normalizeProductId(productId)
  if (!id) return failure('PRODUCT_UNAVAILABLE', 'Товар не найден')

  await removeCartItem(String(user.id), id)
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