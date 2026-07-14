'use client'

/**
 * modules/productCard/hooks/useRemoveFromCart.ts
 *
 * Mirrors useToggleWishlist.ts's remove flow: optimistic store update,
 * server action call, rollback on failure, toast feedback. Split from
 * useAddToCart.ts because adding needs a quantity while removing doesn't —
 * keeping them as separate single-purpose hooks matches the existing
 * convention in this module.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { removeFromCartAction } from '@/modules/cart/actions/cart.actions'
import { useCartStore } from '@/shared/store/cart.store'
import { useCartItemsStore } from '@/shared/store/cartItems.store'
import { appToast } from '@/shared/lib/toast'

export interface UseRemoveFromCartResult {
  isRemoving: boolean
  removeFromCart: (productId: string, productTitle: string) => Promise<void>
}

export function useRemoveFromCart(): UseRemoveFromCartResult {
  const router = useRouter()
  const [isRemoving, setIsRemoving] = useState(false)
  const setItemCount = useCartStore((s) => s.setItemCount)
  const unmarkInCart = useCartItemsStore((s) => s.remove)
  const markInCart = useCartItemsStore((s) => s.add)

  const removeFromCart = useCallback(
    async (productId: string, productTitle: string) => {
      setIsRemoving(true)
      // Optimistic update — instant UI flip, no waiting on the network.
      unmarkInCart(productId)

      try {
        const result = await removeFromCartAction(productId)

        if (!result.success) {
          markInCart(productId) // rollback
          if (result.error === 'AUTH_REQUIRED') {
            appToast.warning('Войдите в аккаунт, чтобы изменить корзину')
            router.push('/auth/login?from=/cart')
            return
          }
          appToast.warning(result.message ?? 'Не удалось убрать товар из корзины. Попробуйте ещё раз.')
          return
        }

        setItemCount(result.data.summary.totalItems)
        appToast.success(`«${productTitle}» убран из корзины`)
      } catch {
        markInCart(productId) // rollback
        appToast.warning('Не удалось убрать товар из корзины. Попробуйте ещё раз.')
      } finally {
        setIsRemoving(false)
      }
    },
    [router, setItemCount, unmarkInCart, markInCart],
  )

  return { isRemoving, removeFromCart }
}
