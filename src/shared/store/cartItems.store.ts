import { create } from 'zustand'

interface CartItemsStoreState {
  productIds: Set<string>
  hydrated: boolean
  hydrate: (productIds: string[]) => void
  add: (productId: string) => void
  remove: (productId: string) => void
  clear: () => void
}

/**
 * Mirrors wishlist.store.ts: a Set of product IDs currently in the cart,
 * so ProductCard can show "in cart" state synchronously without a network
 * round trip. Distinct from cart.store.ts, which only tracks the header
 * badge count — that store intentionally has no per-product membership.
 */
export const useCartItemsStore = create<CartItemsStoreState>((set) => ({
  productIds: new Set(),
  hydrated: false,

  hydrate: (productIds) =>
    set((state) => (state.hydrated ? state : { productIds: new Set(productIds), hydrated: true })),

  add: (productId) =>
    set((state) => {
      if (state.productIds.has(productId)) return state
      const next = new Set(state.productIds)
      next.add(productId)
      return { productIds: next }
    }),

  remove: (productId) =>
    set((state) => {
      if (!state.productIds.has(productId)) return state
      const next = new Set(state.productIds)
      next.delete(productId)
      return { productIds: next }
    }),

  clear: () => set({ productIds: new Set() }),
}))
