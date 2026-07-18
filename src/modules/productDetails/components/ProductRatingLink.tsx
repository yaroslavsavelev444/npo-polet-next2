"use client";

import { Star } from "lucide-react";
import { pluralizeReviews, StarRating } from "@/modules/reviews";
import { requestOpenReviews } from "../lib/reviews-anchor";

interface ProductRatingLinkProps {
	average: number;
	count: number;
}

/**
 * Компактная строка рейтинга в шапке товара. Кликабельна: открывает вкладку
 * «Отзывы» и прокручивает к ней. Если отзывов ещё нет — приглашает оставить
 * первый, тоже уводя к блоку отзывов.
 */
export function ProductRatingLink({ average, count }: ProductRatingLinkProps) {
	if (count === 0) {
		return (
			<button
				type="button"
				onClick={requestOpenReviews}
				className="group inline-flex w-fit items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
			>
				<Star className="h-4 w-4 text-[var(--border-light)]" aria-hidden />
				<span className="underline-offset-2 group-hover:underline">
					Нет отзывов — оставить первый
				</span>
			</button>
		);
	}

	return (
		<button
			type="button"
			onClick={requestOpenReviews}
			className="group inline-flex w-fit items-center gap-2 text-sm transition-colors"
			aria-label={`Рейтинг ${average.toFixed(1)} из 5, ${count} ${pluralizeReviews(count)}. Перейти к отзывам`}
		>
			<StarRating value={average} size={16} />
			<span className="font-semibold text-[var(--text-primary)]">
				{average.toFixed(1)}
			</span>
			<span className="text-[var(--text-muted)] underline-offset-2 group-hover:underline">
				{count} {pluralizeReviews(count)}
			</span>
		</button>
	);
}
