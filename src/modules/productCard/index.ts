export { ProductCard } from "./components/ProductCard";
export { ProductCardSkeleton } from "./components/ProductCardSkeleton";

export { mapProductToCardData, mapDiscountPercentage } from "./lib/adapter";
export { buildProductJsonLd, buildProductMetadata } from "./lib/seo";
export { getProductHref } from "./lib/routing";
export { calculatePriceBreakdown } from "./lib/pricing";
export { formatPrice } from "./lib/format";

export type {
  ProductCardData,
  ProductCardProps,
  ProductAvailabilityStatus,
} from "./types";