/**
 * modules/productCard — публичный API модуля.
 *
 * Снаружи модуля импортируем только отсюда:
 *   import { ProductCard, mapProductToCardData } from "@/modules/productCard";
 *
 * Внутренние файлы (lib/*, hooks/*, components/* кроме перечисленных ниже)
 * не предназначены для прямого импорта извне модуля.
 */

export { ProductCard } from "./components/ProductCard";
export { ProductCardSkeleton } from "./components/ProductCardSkeleton";

export { mapProductToCardData } from "./lib/adapter";
export { buildProductJsonLd, buildProductMetadata } from "./lib/seo";
export { getProductHref } from "./lib/routing";
export { calculatePriceBreakdown } from "./lib/pricing";

export type {
  ProductCardData,
  ProductCardProps,
  ProductAvailabilityStatus,
} from "./types";
