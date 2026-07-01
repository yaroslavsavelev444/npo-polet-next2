// modules/productGrid/components/ProductGrid.tsx
import { ProductCard } from '@/modules/productCard';
import type { ProductCardData } from '@/modules/productCard/types';

interface ProductGridProps {
  products: ProductCardData[];
  showQuickView?: boolean;
  onQuickView?: (product: ProductCardData) => void;
  className?: string;
}

export function ProductGrid({
  products,
  showQuickView,
  onQuickView,
  className,
}: ProductGridProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
        className || ''
      }`}
    >
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