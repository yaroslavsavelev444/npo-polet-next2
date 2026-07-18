import { pluralizeReviews } from "../lib/format";
import type { RatingBreakdown } from "../types";
import { StarRating } from "./StarRating";

interface RatingSummaryProps {
	breakdown: RatingBreakdown;
}

/**
 * Сводка рейтинга: крупная средняя оценка слева и распределение по звёздам
 * справа (полоски 5→1). Стандартный, мгновенно считываемый паттерн из
 * современных маркетплейсов.
 */
export function RatingSummary({ breakdown }: RatingSummaryProps) {
	const { average, count, distribution } = breakdown;

	return (
		<div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
			<div className="flex shrink-0 flex-col items-center gap-1 sm:items-start">
				<span className="text-5xl font-bold leading-none tracking-tight text-[var(--text-primary)]">
					{average.toFixed(1)}
				</span>
				<StarRating value={average} size={18} />
				<span className="text-sm text-[var(--text-muted)]">
					{count} {pluralizeReviews(count)}
				</span>
			</div>

			<div className="flex flex-1 flex-col gap-1.5">
				{([5, 4, 3, 2, 1] as const).map((star) => {
					const value = distribution[star];
					const percent = count > 0 ? (value / count) * 100 : 0;
					return (
						<div key={star} className="flex items-center gap-3 text-xs">
							<span className="w-3 shrink-0 tabular-nums text-[var(--text-muted)]">
								{star}
							</span>
							<div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
								<div
									className="h-full rounded-full bg-[var(--warning)] transition-[width] duration-500"
									style={{ width: `${percent}%` }}
								/>
							</div>
							<span className="w-8 shrink-0 text-right tabular-nums text-[var(--text-muted)]">
								{value}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
