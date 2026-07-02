// src/modules/wishlist/index.ts
export { WishlistPageClient } from './components/WishlistPageClient'
export { WishlistEmptyState } from './components/WishlistEmptyState'
export { WishlistIcon } from './components/WishlistIcon'

// Server Actions — safe to re-export through the barrel, 'use server' lives
// in the source file itself.
export { toggleWishlistAction, clearWishlistAction } from './actions/wishlist.actions'

export type { WishlistView, WishlistItemView, WishlistActionResult } from './types'