// src/modules/cart/index.ts

// Server Actions are safe to re-export through a barrel — the 'use server'
// directive lives in the source file itself, so Next.js replaces these with
// client-side action references regardless of the re-export path.
export {
	addToCartAction,
	clearCartAction,
	getCartRecommendationsAction,
	getCartViewAction,
	getGuestCartViewAction,
	markCartOnboardingSeenAction,
	mergeGuestCartAction,
	removeFromCartAction,
	updateCartItemQuantityAction,
} from "./actions/cart.actions";
export { CartIcon } from "./components/CartIcon";
export { CartPageClient } from "./components/CartPageClient";
export { CartProvider } from "./components/CartProvider";

// Types are erased at compile time — safe.
export type {
	CartActionResult,
	CartEntry,
	CartItemView,
	CartMergeResult,
	CartSummary,
	CartUnavailableItem,
	CartView,
} from "./types";

// buildCartView / buildCartViewFromEntries / EMPTY_CART_VIEW are intentionally
// NOT exported here. They touch the Payload Local API and must only be imported
// directly by server code: app/(frontend)/cart/page.tsx and
// actions/cart.actions.ts already do this correctly.
