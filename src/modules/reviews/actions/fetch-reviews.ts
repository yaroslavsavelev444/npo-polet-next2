"use server";

import { getApprovedReviewsForProduct } from "@/payload/services/reviews.service";
import type { ReviewView } from "../types";

export interface LoadMoreReviewsResult {
	reviews: ReviewView[];
	hasMore: boolean;
	page: number;
}

const PAGE_SIZE = 10;
// Отзывов на товар в разы меньше — глубже листать нечего, а большой OFFSET
// это лишняя работа БД на каждый вызов.
const MAX_PAGE = 1000;

/** Догрузка следующей страницы одобренных отзывов (кнопка «Показать ещё»). */
export async function loadMoreReviewsAction(
	productId: string,
	page: number,
): Promise<LoadMoreReviewsResult> {
	// Server Action вызывается и напрямую, а не только кнопкой «Показать ещё»:
	// нормализуем номер страницы, чтобы отрицательное/дробное/огромное
	// значение не уходило в OFFSET запроса.
	const safePage =
		Number.isSafeInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1;

	const result = await getApprovedReviewsForProduct(productId, {
		page: safePage,
		limit: PAGE_SIZE,
	});
	return {
		reviews: result.reviews,
		hasMore: result.hasNextPage,
		page: result.page,
	};
}
