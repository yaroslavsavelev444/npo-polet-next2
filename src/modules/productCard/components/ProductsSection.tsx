// modules/productCard/components/ProductsSection.tsx

import type { ProductCardData } from "@/modules/productCard/types";
import { Empty } from "@/UI";
import { ProductGrid } from "./productGrid";

interface ProductsSectionProps {
	products: ProductCardData[];
	title?: string;
	description?: string;
	emptyMessage?: string;
	showQuickView?: boolean;
	onQuickView?: (product: ProductCardData) => void;
	className?: string;
}

/**
 * Именованная секция со списком товаров — «Похожие товары», «Избранное»,
 * подборка на главной. Заголовок оформлен так же, как заголовки секций на
 * странице товара (одна ступень шкалы, тот же вес и трекинг), чтобы блоки из
 * разных модулей на одной странице не выглядели собранными из разных систем.
 */
export function ProductsSection({
	products = [],
	title,
	description,
	emptyMessage = "Товаров не найдено.",
	showQuickView,
	onQuickView,
	className,
}: ProductsSectionProps) {
	return (
		<section className={className}>
			{(title || description) && (
				<div className="mb-5 flex flex-col gap-1">
					{title && (
						<h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-2xl">
							{title}
						</h2>
					)}
					{description && (
						<p className="max-w-[60ch] text-sm text-[var(--text-secondary)]">
							{description}
						</p>
					)}
				</div>
			)}

			{products.length === 0 ? (
				<Empty message={emptyMessage} className="py-14" />
			) : (
				<ProductGrid
					products={products}
					showQuickView={showQuickView}
					onQuickView={onQuickView}
				/>
			)}
		</section>
	);
}
