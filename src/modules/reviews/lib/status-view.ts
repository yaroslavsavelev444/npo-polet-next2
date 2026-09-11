import type { ReviewStatus } from "@/payload/services/reviews.service";

/**
 * Как показывать статус собственного отзыва.
 *
 * Статус без объяснения бесполезен: «Отклонён» сам по себе — тупик, а «На
 * модерации» без срока читается как «потерялся». Поэтому у каждого состояния
 * есть не только подпись, но и пояснение, что происходит и чего ждать.
 *
 * Значок различает состояния силуэтом: цвет здесь только усиливает и в
 * одиночку ничего не сообщает.
 */
export interface ReviewStatusView {
	label: string;
	/** Что происходит и что будет дальше. */
	hint: string;
	tone: "approved" | "pending" | "rejected";
}

export const REVIEW_STATUS_VIEW: Record<ReviewStatus, ReviewStatusView> = {
	approved: {
		label: "Опубликован",
		hint: "Отзыв виден всем на странице товара и в общей ленте отзывов.",
		tone: "approved",
	},
	pending: {
		label: "На модерации",
		hint: "Отзыв проверяет модератор. Как только проверка закончится, вы получите уведомление.",
		tone: "pending",
	},
	rejected: {
		label: "Отклонён",
		hint: "Отзыв не прошёл модерацию и не публикуется.",
		tone: "rejected",
	},
};

/** Подписи статусов для панели отбора. */
export const REVIEW_STATUS_FILTERS: {
	key: "all" | ReviewStatus;
	label: string;
}[] = [
	{ key: "all", label: "Все" },
	{ key: "approved", label: "Опубликованные" },
	{ key: "pending", label: "На модерации" },
	{ key: "rejected", label: "Отклонённые" },
];

export type MyReviewsFilter = "all" | ReviewStatus;

export function isValidMyReviewsFilter(
	value: string | undefined,
): value is MyReviewsFilter {
	return REVIEW_STATUS_FILTERS.some((item) => item.key === value);
}
