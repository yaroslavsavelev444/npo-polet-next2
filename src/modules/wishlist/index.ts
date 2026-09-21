// src/modules/wishlist/index.ts

// Server Actions — safe to re-export through the barrel, 'use server' lives
// in the source file itself.
export {
	clearWishlistAction,
	toggleWishlistAction,
} from "./actions/wishlist.actions";
export { ClearWishlistDialog } from "./components/ClearWishlistDialog";
export { WishlistEmptyState } from "./components/WishlistEmptyState";
export { WishlistHero } from "./components/WishlistHero";
export { WishlistIcon } from "./components/WishlistIcon";
export { WishlistPageClient } from "./components/WishlistPageClient";
export { WishlistRail } from "./components/WishlistRail";

export { pluralizeItems, pluralizeProducts } from "./lib/format";
export type { WishlistSortValue } from "./lib/sort";
export {
	DEFAULT_WISHLIST_SORT,
	sortWishlistItems,
	WISHLIST_SORT_OPTIONS,
} from "./lib/sort";

export type {
	WishlistActionResult,
	WishlistItemView,
	WishlistView,
} from "./types";
