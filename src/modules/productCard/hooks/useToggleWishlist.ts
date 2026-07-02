'use client'

/**
 * modules/productCard/hooks/useToggleWishlist.ts
 *
 * Mirrors useAddToCart.ts: optimistic store update, server action call,
 * rollback on failure, toast feedback. Imports the wishlist action/store
 * directly (not via the wishlist module barrel) to keep this a one-way
 * dependency — productCard -> wishlist, never the reverse.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toggleWishlistAction } from '@/modules/wishlist/actions/wishlist.actions'
import { useWishlistStore } from '@/shared/store/wishlist.store'
import type { ProductCardData } from '../types'
import { appToast } from '@/shared/lib/toast'

export interface UseToggleWishlistResult {
  isInWishlist: boolean
  isToggling: boolean
  toggleWishlist: (product: ProductCardData) => Promise<void>
}

export function useToggleWishlist(productId: string): UseToggleWishlistResult {
  const router = useRouter()
  const [isToggling, setIsToggling] = useState(false)

  const isInWishlist = useWishlistStore((s) => s.productIds.has(productId))
  const add = useWishlistStore((s) => s.add)
  const remove = useWishlistStore((s) => s.remove)

  const toggleWishlist = useCallback(
    async (product: ProductCardData) => {
      const wasInWishlist = isInWishlist
      setIsToggling(true)

      // Optimistic update — instant heart flip, no waiting on the network.
      if (wasInWishlist) remove(productId)
      else add(productId)

      try {
        const result = await toggleWishlistAction(productId)

        if (!result.success) {
          // Roll back the optimistic change
          if (wasInWishlist) add(productId)
          else remove(productId)

          if (result.error === 'AUTH_REQUIRED') {
            appToast.warning(`Войдите в аккаунт, чтобы добавить товар в избранное`)
            router.push('/auth/login?from=/wishlist')
            return
          }
          appToast.warning(result.message ?? 'Не удалось обновить избранное. Попробуйте ещё раз.')
          return
        }

        // Reconcile with the server's view in case of a race
        if (result.data.isFavorite) add(productId)
        else remove(productId)
appToast.success(result.data.isFavorite
            ? `«${product.title}» добавлен в избранное`
            : `«${product.title}» удалён из избранного`,
          )
      } catch {
        if (wasInWishlist) add(productId)
        else remove(productId)
      appToast.warning('Не удалось обновить избранное. Попробуйте ещё раз.')
      } finally {
        setIsToggling(false)
      }
    },
    [isInWishlist, productId, add, remove, appToast, router],
  )

  return { isInWishlist, isToggling, toggleWishlist }
}