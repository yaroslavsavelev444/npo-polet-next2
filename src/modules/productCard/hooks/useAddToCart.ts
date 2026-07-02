// src/modules/productCard/hooks/useAddToCart.ts
'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addToCartAction } from '@/modules/cart/actions/cart.actions'
import { useCartStore } from '@/shared/store/cart.store'
import type { ProductCardData } from '../types'
import { appToast } from '@/shared/lib/toast'

export interface UseAddToCartResult {
  isAdding: boolean
  addToCart: (product: ProductCardData, quantity: number) => Promise<void>
}

export function useAddToCart(): UseAddToCartResult {
  const router = useRouter()
  const [isAdding, setIsAdding] = useState(false)
  const setItemCount = useCartStore((s) => s.setItemCount)

  const addToCart = useCallback(
    async (product: ProductCardData, quantity: number) => {
      setIsAdding(true)
      try {
        const result = await addToCartAction(product.id, quantity)

        if (!result.success) {
          if (result.error === 'AUTH_REQUIRED') {
            appToast.warning('Войдите в аккаунт, чтобы добавить товар в корзину')
            router.push('/auth/login?from=/cart')
            return
          }
          appToast.warning(result.message ?? 'Не удалось добавить товар в корзину. Попробуйте ещё раз.')
          return
        }

        setItemCount(result.data.summary.totalItems)
                  appToast.success(`«${product.title}» добавлен в корзину (${quantity} шт.)`)

      } catch {
        appToast.warning('Не удалось добавить товар в корзину. Попробуйте ещё раз.')
      } finally {
        setIsAdding(false)
      }
    },
    [appToast, router, setItemCount],
  )

  return { isAdding, addToCart }
}