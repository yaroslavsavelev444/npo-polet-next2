/**
 * modules/productCard/components/ProductPrice.tsx
 *
 * Цена в двух размерах.
 *
 * В карточке каталога намеренно показывается ТОЛЬКО итоговая цена, одной
 * строкой. Зачёркнутая старая цена рядом с новой не помещалась в узкую
 * колонку и переносилась на вторую строку — из-за этого карточки со скидкой
 * оказывались выше соседних, ряд растягивался, и кнопки в нём разъезжались.
 * Факт скидки на карточке несёт бейдж «−15%» на кадре, а точная старая цена —
 * атрибут страницы товара, где для неё есть место.
 *
 * Компонент отображающий, без "use client": рендерится на сервере как часть
 * SSR-оболочки карточки.
 */

import { cn } from "@/utils/cn";
import { formatPrice } from "../lib/format";
import type { ProductPriceProps } from "../types";

export function ProductPrice({
	finalPrice,
	originalPrice,
	hasDiscount,
	size = "card",
	discountPercentage = null,
	className,
}: ProductPriceProps) {
	if (size === "card") {
		return (
			<p
				className={cn(
					"flex h-7 items-center text-[17px] font-bold leading-none tracking-[-0.02em] tabular-nums text-[var(--text-primary)] sm:text-lg",
					className,
				)}
			>
				{formatPrice(finalPrice)}
			</p>
		);
	}

	return (
		<div
			className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}
		>
			<span className="text-[28px] font-bold leading-none tracking-[-0.025em] tabular-nums text-[var(--text-primary)] sm:text-[32px]">
				{formatPrice(finalPrice)}
			</span>

			{hasDiscount && (
				<span className="flex items-baseline gap-2">
					<span className="text-base leading-none tabular-nums text-[var(--text-muted)] line-through">
						{formatPrice(originalPrice)}
					</span>
					{discountPercentage != null && (
						<span className="rounded-[var(--radius-sm)] bg-[var(--primary)]/15 px-1.5 py-[0.25rem] text-xs font-semibold leading-none tabular-nums text-[var(--primary-300)]">
							−{discountPercentage}%
						</span>
					)}
				</span>
			)}
		</div>
	);
}
