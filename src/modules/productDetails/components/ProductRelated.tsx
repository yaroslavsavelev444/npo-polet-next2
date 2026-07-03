import type { ProductCardData } from "@/modules/productCard";
import { ProductListContainer } from "@/modules/productCard/components/ProductListContainer";

interface Props {
  products: ProductCardData[];
}

export function ProductRelated({ products }: Props) {
  if (products.length === 0) return null;

  return (
    <ProductListContainer
      products={products}
      totalProducts={products.length}
      title="Похожие товары"
    />
  );
}
