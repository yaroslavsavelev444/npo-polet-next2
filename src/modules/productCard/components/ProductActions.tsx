// modules/productCard/components/ProductActions.tsx
"use client";

import { Eye } from "lucide-react";
import { WishlistButton } from "@/modules/wishlist/components/WishlistButton";
import { CircleIconButton } from "@/shared/components/CircleIconButton";
import type { ProductActionsProps, ProductCardData } from "../types";

interface Props extends ProductActionsProps {
	product: ProductCardData;
}

/**
 * Оверлейные действия поверх кадра. Отступ совпадает с отступом бейджа скидки
 * в противоположном углу — два элемента на кадре стоят на одной линии.
 */
export function ProductActions({ product, showQuickView, onQuickView }: Props) {
	const handleQuickView = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onQuickView?.();
	};

	return (
		<div className="absolute right-2 top-2 z-30 flex flex-col gap-2">
			<WishlistButton product={product} />

			{showQuickView && (
				<CircleIconButton
					onClick={handleQuickView}
					aria-label="Быстрый просмотр"
					title="Быстрый просмотр"
					className="opacity-0 transition-opacity duration-150 group-hover:!opacity-100 focus-visible:!opacity-100 max-md:!opacity-100"
				>
					<Eye size={16} aria-hidden="true" />
				</CircleIconButton>
			)}
		</div>
	);
}
