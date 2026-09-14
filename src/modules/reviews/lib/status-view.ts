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

/**
 * Разделы страницы «Мои отзывы» в порядке появления на панели отбора.
 *
 * «Можно оценить» стоит ПЕРВЫМ и по смыслу выбивается из ряда: остальные
 * позиции отбирают уже написанные отзывы по статусу, а этот показывает
 * товары, о которых отзыва ещё нет. Место выбрано не ради симметрии, а по
 * задаче раздела: список уже написанного человек листает, чтобы свериться, а
 * предложение оценить — единственное, что здесь требует действия. Ставить
 * призыв к действию после архива значит прятать его.
 *
 * Панель остаётся одна: заводить рядом второй переключатель, отбирающий по
 * другому признаку, — способ сделать страницу непонятной.
 */
export const REVIEW_SECTIONS: {
	key: MyReviewsSection;
	label: string;
}[] = [
	{ key: "to-review", label: "Можно оценить" },
	{ key: "all", label: "Все" },
	{ key: "approved", label: "Опубликованные" },
	{ key: "pending", label: "На модерации" },
	{ key: "rejected", label: "Отклонённые" },
];

/**
 * Раздел страницы: либо предложения оценить, либо отбор написанных отзывов.
 *
 * Отделён от MyReviewsFilter намеренно. MyReviewsFilter — то, что уходит в
 * запрос отзывов, и "to-review" там недопустим: такого статуса у отзыва не
 * существует. Один общий тип на оба смысла позволил бы передать "to-review" в
 * выборку по статусу, а этого не должно быть даже теоретически.
 */
export type MyReviewsSection = "to-review" | "all" | ReviewStatus;

/** Отбор написанных отзывов по статусу — то, что уходит в getUserReviews. */
export type MyReviewsFilter = "all" | ReviewStatus;

export function isValidMyReviewsSection(
	value: string | undefined,
): value is MyReviewsSection {
	return REVIEW_SECTIONS.some((item) => item.key === value);
}

/** Раздел, приведённый к отбору по статусу. Для «Можно оценить» отбора нет. */
export function sectionToFilter(section: MyReviewsSection): MyReviewsFilter {
	return section === "to-review" ? "all" : section;
}
