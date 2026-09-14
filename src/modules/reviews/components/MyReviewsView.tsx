"use client";

import {
	AlertCircle,
	Loader2,
	MessageSquarePlus,
	PackageCheck,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import type { MyReviewView } from "@/payload/services/reviews.service";
import { loadMoreMyReviewsAction } from "../actions/fetch-reviews";
import { pluralizeReviews } from "../lib/format";
import type { MyReviewsFilter } from "../lib/status-view";
import { MyReviewRow } from "./MyReviewRow";
import styles from "./Reviews.module.css";

interface MyReviewsViewProps {
	initialReviews: MyReviewView[];
	initialHasMore: boolean;
	totalDocs: number;
	filter: MyReviewsFilter;
}

const EMPTY_COPY: Record<MyReviewsFilter, { title: string; text: string }> = {
	all: {
		title: "Отзывов пока нет",
		text: "Товары из завершённых заказов, о которых можно высказаться, собраны в разделе «Можно оценить».",
	},
	approved: {
		title: "Опубликованных отзывов нет",
		text: "Здесь появятся отзывы, прошедшие проверку модератором.",
	},
	pending: {
		title: "На модерации ничего нет",
		text: "Все ваши отзывы уже проверены.",
	},
	rejected: {
		title: "Отклонённых отзывов нет",
		text: "Ни один ваш отзыв не был отклонён.",
	},
};

/**
 * Личный список отзывов.
 *
 * Устроен так же, как публичная лента, — первая страница с сервера, остальные
 * по кнопке, — но показывает отзывы в ЛЮБОМ статусе: автор обязан видеть, что
 * его отзыв принят на модерацию, и узнать причину, если он отклонён.
 *
 * Пустое состояние объясняет не «здесь пусто», а что сделать: отзыв нельзя
 * оставить откуда угодно — право на него даёт только завершённая покупка
 * (см. getReviewEligibility). Поэтому переход ведёт в раздел «Можно оценить»,
 * а не в каталог: из каталога отзыв оставить всё равно не выйдет.
 */
export function MyReviewsView({
	initialReviews,
	initialHasMore,
	totalDocs,
	filter,
}: MyReviewsViewProps) {
	const [reviews, setReviews] = useState(initialReviews);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(initialHasMore);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleLoadMore() {
		setIsLoading(true);
		setError(null);
		try {
			const next = await loadMoreMyReviewsAction(
				page + 1,
				filter === "all" ? null : filter,
			);
			setReviews((prev) => {
				const seen = new Set(prev.map((review) => review.id));
				return [...prev, ...next.reviews.filter((r) => !seen.has(r.id))];
			});
			setPage(next.page);
			setHasMore(next.hasMore);
		} catch {
			setError("Не удалось загрузить отзывы. Попробуйте ещё раз.");
		} finally {
			setIsLoading(false);
		}
	}

	if (reviews.length === 0) {
		const copy = EMPTY_COPY[filter];
		return (
			<div className={styles.empty}>
				<MessageSquarePlus
					size={28}
					strokeWidth={1.25}
					aria-hidden
					className="text-[var(--border-light)]"
				/>
				<p className={styles.emptyTitle}>{copy.title}</p>
				<p className={styles.emptyText}>{copy.text}</p>
				{filter === "all" ? (
					/* Раньше отсюда вели в заказы: оставить отзыв можно было только
					   со страницы товара, и найти её получалось лишь через заказ.
					   Теперь есть раздел, который сам показывает, что доступно для
					   оценки, — путь через список заказов стал длиннее без причины. */
					<Link
						href="/profile/reviews?status=to-review"
						className={`${styles.btn} ${styles.btnPrimary}`}
					>
						<PackageCheck size={15} aria-hidden />
						Что можно оценить
					</Link>
				) : (
					<Link
						href="/profile/reviews"
						className={`${styles.btn} ${styles.btnQuiet}`}
					>
						Показать все отзывы
					</Link>
				)}
			</div>
		);
	}

	return (
		<>
			<ul className={styles.rows}>
				{reviews.map((review, index) => (
					<MyReviewRow key={review.id} review={review} index={index % 10} />
				))}
			</ul>

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

export default MyReviewsView;
