/**
 * modules/productCard/components/ProductMeta.tsx
 *
 * Служебная строка карточки — единственное место, где карточка сообщает
 * состояние товара: наличие слева, вторичный факт покупки справа.
 *
 * Набрана моноширинным верхним регистром с разрядкой — тем же служебным
 * голосом, которым говорят индексы в мобильном меню, подписи в корзине и
 * сводка в панели каталога. У этой строки в карточке новая работа: она стоит
 * первой под кадром и на месте бывшей рамки отбивает начало текстового блока.
 *
 * Правый слот занимает рейтинг, если отзывы есть, иначе — минимальная партия,
 * если она больше единицы. Оба факта относятся к покупке, взаимно редки и
 * никогда не нужны одновременно: рейтинг важнее, потому что влияет на выбор,
 * а не на оформление.
 *
 * Высота строки фиксирована независимо от содержимого — на ней держится
 * вертикальное выравнивание всех карточек ряда.
 */

import { Star } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatReviewsCount } from "../lib/format";
import { PRODUCT_STATUS_LABELS } from "../lib/status";
import type { ProductAvailabilityStatus } from "../types";
import styles from "./ProductCard.module.css";

interface ProductMetaProps {
	status: ProductAvailabilityStatus;
	rating: number;
	reviewsCount: number;
	minOrderQuantity: number;
}

const STATUS_TONE: Record<
	ProductAvailabilityStatus,
	{ dot: string; text: string }
> = {
	available: {
		dot: "bg-[var(--success)]",
		text: "text-[var(--text-secondary)]",
	},
	preorder: {
		dot: "bg-[var(--warning)]",
		text: "text-[var(--text-secondary)]",
	},
	out_of_stock: {
		dot: "bg-[var(--border-light)]",
		text: "text-[var(--text-muted)]",
	},
	discontinued: {
		dot: "bg-[var(--border-light)]",
		text: "text-[var(--text-muted)]",
	},
};

export function ProductMeta({
	status,
	rating,
	reviewsCount,
	minOrderQuantity,
}: ProductMetaProps) {
	const tone = STATUS_TONE[status];
	const showBatch = reviewsCount === 0 && minOrderQuantity > 1;

	return (
		<div className={styles.meta}>
			<span className={cn(styles.metaStatus, tone.text)}>
				<span className={cn(styles.metaDot, tone.dot)} aria-hidden="true" />
				<span className={styles.metaTruncate}>
					{PRODUCT_STATUS_LABELS[status]}
				</span>
			</span>

			{reviewsCount > 0 && (
				<span className={styles.metaSide}>
					<Star
						className="h-3 w-3 fill-[var(--warning)] text-[var(--warning)]"
						aria-hidden="true"
					/>
					<span className="font-semibold text-[var(--text-primary)]">
						{rating.toFixed(1)}
					</span>
					<span>{formatReviewsCount(reviewsCount)}</span>
				</span>
			)}

			{showBatch && (
				<span className={styles.metaSide}>от {minOrderQuantity} шт</span>
			)}
		</div>
	);
}
