// src/modules/productCard/components/ProductListContainer.tsx

import type { ProductCardData } from "@/modules/productCard/types";
import { ProductsSection } from "./ProductsSection";

interface ProductListContainerProps {
  products: ProductCardData[];
  totalProducts: number;
  title?: string;
  description?: string;
  emptyMessage?: string;
  showQuickView?: boolean;
  onQuickView?: (product: ProductCardData) => void;
  className?: string;
}

export function ProductListContainer({
  products,
  title,
  description,
  emptyMessage = "Товары не найдены",
  showQuickView,
  onQuickView,
  className,
}: ProductListContainerProps) {
  return (
    <ProductsSection
      products={products}
      title={title}
      description={description}
      emptyMessage={emptyMessage}
      showQuickView={showQuickView}
      onQuickView={onQuickView}
      className={className}
    />
  );
}
