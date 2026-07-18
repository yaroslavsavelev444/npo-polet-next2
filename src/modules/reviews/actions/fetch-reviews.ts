"use server";

import { getApprovedReviewsForProduct } from "@/payload/services/reviews.service";
import type { ReviewView } from "../types";

export interface LoadMoreReviewsResult {
	reviews: ReviewView[];
	hasMore: boolean;
	page: number;
}

const PAGE_SIZE = 10;

/** Догрузка следующей страницы одобренных отзывов (кнопка «Показать ещё»). */
export async function loadMoreReviewsAction(
	productId: string,
	page: number,
): Promise<LoadMoreReviewsResult> {
	const result = await getApprovedReviewsForProduct(productId, {
		page,
		limit: PAGE_SIZE,
	});
	return {
		reviews: result.reviews,
		hasMore: result.hasNextPage,
		page: result.page,
	};
}
