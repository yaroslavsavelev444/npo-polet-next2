import { pluralizeReviews } from "../lib/format";
import type { RatingBreakdown } from "../types";
import styles from "./Reviews.module.css";
import { StarRating } from "./StarRating";

interface RatingSummaryProps {
	breakdown: RatingBreakdown;
	/**
	 * `stacked` — колонкой (первый экран публичной страницы, где на сводку
	 * отведена узкая колонка рядом с заголовком);
	 * `inline` — средняя оценка слева, распределение справа (страница товара,
	 * где сводка лежит поперёк всей ширины блока).
	 */
	variant?: "stacked" | "inline";
}

/**
 * Сводка рейтинга: средняя оценка, число отзывов и распределение по звёздам.
 *
 * Один компонент на страницу товара и на публичную ленту отзывов — сводка
 * должна выглядеть одинаково там и там, различается только раскладка.
 *
 * Распределение — не украшение: оно отвечает на вопрос, из чего сложилась
 * средняя. «4,6» при двадцати пятёрках и одной единице и «4,6» при равномерном
 * разбросе — разные вещи, и полосы показывают разницу сразу.
 *
 * Числа рядом с полосами продублированы текстом намеренно: полосы помечены
 * aria-hidden, а значение читается из подписи — рейтинг не должен
 * передаваться одной картинкой.
 */
export function RatingSummary({
	breakdown,
	variant = "inline",
}: RatingSummaryProps) {
	const { average, count, distribution } = breakdown;

	return (
		<div
			className={
				variant === "stacked"
					? styles.summary
					: `${styles.summary} sm:flex-row sm:items-center sm:gap-[2.5rem]`
			}
		>
			<div className={styles.summaryHead}>
				<span className={styles.summaryValue}>
					{average.toFixed(1).replace(".", ",")}
				</span>
				<span className={styles.summaryAside}>
					<StarRating value={average} size={16} />
					<span className="text-[0.8125rem] text-[var(--text-muted)]">
						{count} {pluralizeReviews(count)}
					</span>
				</span>
			</div>

			<dl className={`${styles.bars} flex-1`}>
				{([5, 4, 3, 2, 1] as const).map((star) => {
					const value = distribution[star];
					const percent = count > 0 ? (value / count) * 100 : 0;
					return (
						<div key={star} className={styles.bar}>
							<dt>{star} ★</dt>
							<span className={styles.barTrack} aria-hidden>
								<span
									className={styles.barFill}
									style={{ width: `${percent}%` }}
								/>
							</span>
							<dd className={`${styles.barCount} m-0`}>{value}</dd>
						</div>
					);
				})}
			</dl>
		</div>
	);
}

export default RatingSummary;
