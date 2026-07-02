// src/shared/store/cart.store.ts
import { create } from 'zustand'

interface CartStoreState {
  itemCount: number
  hydrated: boolean
  setItemCount: (count: number) => void
  hydrate: (count: number) => void
}

/**
 * Deliberately minimal: the header only ever needs the badge number.
 * Full cart contents live server-side and in the cart page's own state —
 * duplicating them here would be a second source of truth for no benefit.
 */
export const useCartStore = create<CartStoreState>((set) => ({
  itemCount: 0,
  hydrated: false,
  setItemCount: (itemCount) => set({ itemCount }),
  hydrate: (count) => set((state) => (state.hydrated ? state : { itemCount: count, hydrated: true })),
}))