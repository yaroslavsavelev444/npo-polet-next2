export { ProductCard } from "./components/ProductCard";
export { ProductCardSkeleton } from "./components/ProductCardSkeleton";

export { mapDiscountPercentage, mapProductToCardData } from "./lib/adapter";
export { formatPrice } from "./lib/format";
export { calculatePriceBreakdown } from "./lib/pricing";
export { getProductHref } from "./lib/routing";
export { buildProductJsonLd, buildProductMetadata } from "./lib/seo";
export { getProductStatusLabel } from "./lib/status";
export type {
  ProductAvailabilityStatus,
  ProductCardData,
  ProductCardProps,
} from "./types";
