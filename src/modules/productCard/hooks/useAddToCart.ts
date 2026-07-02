// src/modules/productCard/hooks/useAddToCart.ts
'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@once-ui-system/core'
import { addToCartAction } from '@/modules/cart/actions/cart.actions'
import { useCartStore } from '@/shared/store/cart.store'
import type { ProductCardData } from '../types'

export interface UseAddToCartResult {
  isAdding: boolean
  addToCart: (product: ProductCardData, quantity: number) => Promise<void>
}

export function useAddToCart(): UseAddToCartResult {
  const { addToast } = useToast()
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
            addToast({ variant: 'danger', message: 'Войдите в аккаунт, чтобы добавить товар в корзину' })
            router.push('/auth/login?from=/cart')
            return
          }
          addToast({ variant: 'danger', message: result.message })
          return
        }

        setItemCount(result.data.summary.totalItems)
        addToast({
          variant: 'success',
          message: `«${product.title}» добавлен в корзину (${quantity} шт.)`,
        })
      } catch {
        addToast({ variant: 'danger', message: 'Не удалось добавить товар в корзину. Попробуйте ещё раз.' })
      } finally {
        setIsAdding(false)
      }
    },
    [addToast, router, setItemCount],
  )

  return { isAdding, addToCart }
}