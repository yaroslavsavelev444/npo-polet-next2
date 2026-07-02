import { create } from 'zustand'

interface WishlistStoreState {
  productIds: Set<string>
  hydrated: boolean
  hydrate: (productIds: string[]) => void
  add: (productId: string) => void
  remove: (productId: string) => void
  clear: () => void
}

/**
 * Unlike cart.store.ts, this store keeps a Set of favorited product IDs
 * rather than just a count — the heart icon on every ProductCard needs
 * per-product membership synchronously, without a network round trip.
 * `count` is intentionally NOT stored separately; it's always derived
 * from productIds.size to avoid a second source of truth.
 */
export const useWishlistStore = create<WishlistStoreState>((set) => ({
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