// modules/productGrid/components/ProductGrid.tsx
import { ProductCard } from '@/modules/productCard';
import type { ProductCardData } from '@/modules/productCard/types';

interface ProductGridProps {
  products: ProductCardData[];
  showQuickView?: boolean;
  onQuickView?: (product: ProductCardData) => void;
  className?: string;
}

/**
 * Shared with loading-state fallbacks (e.g. ProductCatalogLayout's Suspense
 * boundary) so the skeleton grid never reflows into a different column
 * count once real data arrives.
 */
export const PRODUCT_GRID_CLASSNAME =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 xl:gap-6';

export function ProductGrid({
  products,
  showQuickView,
  onQuickView,
  className,
}: ProductGridProps) {
  return (
    <div className={`${PRODUCT_GRID_CLASSNAME} ${className || ''}`}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          showQuickView={showQuickView}
          onQuickView={onQuickView}
        />
      ))}
    </div>
  );
}