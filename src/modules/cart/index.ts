// src/modules/cart/index.ts
export { CartPageClient } from './components/CartPageClient'
export { CartIcon } from './components/CartIcon'

// Server Actions are safe to re-export through a barrel — the 'use server'
// directive lives in the source file itself, so Next.js replaces these with
// client-side action references regardless of the re-export path.
export {
  addToCartAction,
  updateCartItemQuantityAction,
  removeFromCartAction,
  clearCartAction,
  getCartViewAction,
} from './actions/cart.actions'

// Types are erased at compile time — safe.
export type { CartView, CartItemView, CartSummary, CartActionResult } from './types'

// buildCartView / EMPTY_CART_VIEW are intentionally NOT exported here.
// They touch the Payload Local API and must only be imported directly by
// server code: app/(frontend)/cart/page.tsx and actions/cart.actions.ts
// already do this correctly.