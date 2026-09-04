/**
 * modules/productCard/components/ProductMeta.tsx
 *
 * Служебная строка карточки — единственное место, где карточка сообщает
 * состояние товара: наличие слева, вторичный факт покупки справа.
 *
 * Раньше в этом слоте жила только строка «Нет отзывов». На витрине, где
 * отзывов почти нет, она занимала место в каждой карточке и не сообщала
 * ничего, а статус наличия дублировался дважды — ярлыком поверх кадра и
 * текстом на заблокированной кнопке. Здесь статус печатается ровно один раз,
 * а кнопка называет только действие.
 *
 * Правый слот занимает рейтинг, если отзывы есть, иначе — минимальная партия,
 * если она больше единицы. Оба факта относятся к покупке, взаимно редки и
 * никогда не нужны одновременно: рейтинг важнее, потому что влияет на выбор,
 * а не на оформление.
 *
 * Высота строки фиксирована (h-4) независимо от содержимого — на ней держится
 * вертикальное выравнивание всех карточек ряда.
 */

import { Star } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatReviewsCount } from "../lib/format";
import { PRODUCT_STATUS_LABELS } from "../lib/status";
import type { ProductAvailabilityStatus } from "../types";

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
		<div className="flex h-4 items-center justify-between gap-2 text-[11px] leading-none">
			<span className={cn("flex min-w-0 items-center gap-1.5", tone.text)}>
				<span
					className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)}
					aria-hidden="true"
				/>
				<span className="truncate">{PRODUCT_STATUS_LABELS[status]}</span>
			</span>

			{reviewsCount > 0 && (
				<span className="flex shrink-0 items-center gap-1 text-[var(--text-muted)]">
					<Star
						className="h-3 w-3 fill-[var(--warning)] text-[var(--warning)]"
						aria-hidden="true"
					/>
					<span className="font-semibold tabular-nums text-[var(--text-primary)]">
						{rating.toFixed(1)}
					</span>
					<span className="tabular-nums">
						{formatReviewsCount(reviewsCount)}
					</span>
				</span>
			)}

			{showBatch && (
				<span className="shrink-0 tabular-nums text-[var(--text-muted)]">
					от {minOrderQuantity} шт
				</span>
			)}
		</div>
	);
}
