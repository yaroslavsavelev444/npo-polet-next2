import type { ProductCardData } from "@/modules/productCard";
import { ProductListContainer } from "@/modules/productCard/components/ProductListContainer";

interface Props {
	products: ProductCardData[];
	className?: string;
}

export function ProductRelated({ products, className }: Props) {
	if (products.length === 0) return null;

	return (
		<ProductListContainer
			products={products}
			totalProducts={products.length}
			title="Похожие товары"
			className={className}
		/>
	);
}
