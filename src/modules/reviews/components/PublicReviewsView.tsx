"use client";

import { AlertCircle, Loader2, MessageSquareOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import type { PublicReviewView } from "@/payload/services/reviews.service";
import { loadMorePublicReviewsAction } from "../actions/fetch-reviews";
import { pluralizeReviews } from "../lib/format";
import { PublicReviewCard } from "./PublicReviewCard";
import styles from "./Reviews.module.css";

interface PublicReviewsViewProps {
	initialReviews: PublicReviewView[];
	initialHasMore: boolean;
	totalDocs: number;
	/** Выбранная оценка или null — нужен для догрузки той же выдачи. */
	rating: number | null;
}

/**
 * Публичная лента отзывов.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ «ПОКАЗАТЬ ЕЩЁ», А НЕ СТРАНИЦЫ И НЕ БЕСКОНЕЧНАЯ ПРОКРУТКА
 * ────────────────────────────────────────────────────────────────────────────
 * Отзывы читают подряд, пока не надоест, — это не поиск конкретной записи, и
 * номер страницы здесь ничего не значит. Бесконечная прокрутка на публичной
 * странице отнимает у посетителя контроль и уносит подвал, а кнопка оставляет
 * решение за ним.
 *
 * Тот же приём уже работает в блоке отзывов на странице товара — и это второй
 * довод: два разных способа листать одну и ту же сущность на соседних
 * страницах пришлось бы объяснять.
 *
 * Первая страница приходит с сервера уже отрисованной: поисковик видит
 * настоящие отзывы в разметке, а не пустой список, который наполнится
 * скриптом.
 */
export function PublicReviewsView({
	initialReviews,
	initialHasMore,
	totalDocs,
	rating,
}: PublicReviewsViewProps) {
	const [reviews, setReviews] = useState(initialReviews);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(initialHasMore);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleLoadMore() {
		setIsLoading(true);
		setError(null);
		try {
			const next = await loadMorePublicReviewsAction(page + 1, rating);
			setReviews((prev) => {
				// Отзыв мог одновременно уйти с модерации и сдвинуть выдачу —
				// защищаемся от дубля по id, а не полагаемся на неизменность
				// страниц.
				const seen = new Set(prev.map((review) => review.id));
				return [...prev, ...next.reviews.filter((r) => !seen.has(r.id))];
			});
			setPage(next.page);
			setHasMore(next.hasMore);
		} catch {
			// Подробности отказа посетителю ничем не помогут, а действие
			// очевидно одно — попробовать снова.
			setError("Не удалось загрузить отзывы. Попробуйте ещё раз.");
		} finally {
			setIsLoading(false);
		}
	}

	if (reviews.length === 0) {
		return (
			<div className={styles.empty}>
				<MessageSquareOff
					size={28}
					strokeWidth={1.25}
					aria-hidden
					className="text-[var(--border-light)]"
				/>
				<p className={styles.emptyTitle}>
					{rating ? `Отзывов на ${rating} ★ пока нет` : "Отзывов пока нет"}
				</p>
				<p className={styles.emptyText}>
					{rating
						? "Посмотрите отзывы с другой оценкой — или все сразу."
						: "Отзывы появляются здесь после проверки модератором. Первый отзыв можно оставить на странице купленного товара."}
				</p>
				<Link
					href={rating ? "/reviews" : "/category"}
					className={`${styles.btn} ${styles.btnQuiet}`}
				>
					{rating ? "Показать все отзывы" : "Перейти в каталог"}
				</Link>
			</div>
		);
	}

	return (
		<>
			<div className="@container">
				<ul className={styles.grid}>
					{reviews.map((review, index) => (
						<PublicReviewCard
							key={review.id}
							review={review}
							// Каскад отсчитывается от начала ДОГРУЖЕННОЙ порции, а не
							// от начала ленты: иначе тридцатая карточка появлялась бы
							// через полторы секунды после нажатия.
							index={index % 12}
						/>
					))}
				</ul>
			</div>

			{error && (
				<p role="alert" className={styles.errorBox}>
					<AlertCircle
						size={15}
						aria-hidden
						className="mt-[0.1rem] shrink-0 text-[var(--error)]"
					/>
					{error}
				</p>
			)}

			{hasMore ? (
				<div className={styles.actions}>
					<button
						type="button"
						onClick={handleLoadMore}
						disabled={isLoading}
						className={`${styles.btn} ${styles.btnQuiet}`}
					>
						{isLoading && (
							<Loader2 size={15} aria-hidden className={styles.spin} />
						)}
						{isLoading ? "Загружаем…" : "Показать ещё"}
					</button>
				</div>
			) : (
				<div className={styles.tail}>
					<span aria-hidden className={styles.tailRule} />
					<p className={catalog.micro}>
						{/* «Показаны все 1 отзыв» ломается на единственном числе, а
						    отбор по оценке доводит выдачу до одной записи легко. */}
						{totalDocs === 1
							? "Показан 1 отзыв"
							: `Показаны все ${totalDocs} ${pluralizeReviews(totalDocs)}`}
					</p>
					<span aria-hidden className={styles.tailRule} />
				</div>
			)}
		</>
	);
}

export default PublicReviewsView;
