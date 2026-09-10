// modules/productCard/components/ProductActions.tsx
"use client";

import { Eye } from "lucide-react";
import { WishlistButton } from "@/modules/wishlist/components/WishlistButton";
import { CircleIconButton } from "@/shared/components/CircleIconButton";
import { cn } from "@/utils/cn";
import type { ProductActionsProps, ProductCardData } from "../types";
import styles from "./ProductCard.module.css";

interface Props extends ProductActionsProps {
	product: ProductCardData;
}

/**
 * Оверлейные действия поверх кадра. Отступ совпадает с отступом ярлыка скидки
 * в противоположном углу — два элемента на кадре стоят на одной линии.
 *
 * Материал кнопок — tone="glass" (см. CircleIconButton): на плашке кадра
 * прежняя «таблетка с тенью» читалась третьим прямоугольником и спорила со
 * снимком. Избранное видно всегда — это состояние товара, а не подсказка;
 * быстрый просмотр появляется только при наведении и только там, где есть
 * курсор.
 */
export function ProductActions({ product, showQuickView, onQuickView }: Props) {
	const handleQuickView = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onQuickView?.();
	};

	return (
		<div className={styles.actions}>
			<WishlistButton
				product={product}
				tone="glass"
				size="sm"
				className={styles.overlayButton}
			/>

			{showQuickView && (
				<CircleIconButton
					tone="glass"
					size="sm"
					onClick={handleQuickView}
					aria-label="Быстрый просмотр"
					title="Быстрый просмотр"
					className={cn(styles.overlayButton, styles.quickView)}
				>
					<Eye size={15} aria-hidden="true" />
				</CircleIconButton>
			)}
		</div>
	);
}
