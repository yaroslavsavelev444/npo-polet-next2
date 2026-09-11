"use server";

import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import {
	getApprovedReviewsFeed,
	getApprovedReviewsForProduct,
	getUserReviews,
	type MyReviewView,
	type PublicReviewView,
} from "@/payload/services/reviews.service";
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

/** Размер страницы публичной ленты. Больше товарной: карточки в сетке по три. */
const PUBLIC_PAGE_SIZE = 12;
/** Размер страницы личного списка: отзывов у одного человека немного. */
const MY_PAGE_SIZE = 10;

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

/* ===========================================================================
   Догрузка лент отзывов вне страницы товара
   =========================================================================== */

/**
 * Нормализация номера страницы.
 *
 * Server Action вызывается не только кнопкой «Показать ещё»: отрицательное,
 * дробное или огромное значение не должно уходить в OFFSET запроса.
 */
function safePageNumber(page: number): number {
	return Number.isSafeInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1;
}

export interface LoadMorePublicReviewsResult {
	reviews: PublicReviewView[];
	hasMore: boolean;
	page: number;
}

/**
 * Следующая страница публичной ленты «Наши отзывы».
 *
 * Фильтр по статусу здесь не параметр: getApprovedReviewsFeed сама берёт
 * только `approved`. Через это действие нельзя запросить ни отзыв на
 * модерации, ни отклонённый, каким бы ни был ввод.
 */
export async function loadMorePublicReviewsAction(
	page: number,
	rating?: number | null,
): Promise<LoadMorePublicReviewsResult> {
	const safeRating =
		typeof rating === "number" && rating >= 1 && rating <= 5
			? Math.trunc(rating)
			: null;

	const result = await getApprovedReviewsFeed({
		page: safePageNumber(page),
		limit: PUBLIC_PAGE_SIZE,
		rating: safeRating,
	});

	return {
		reviews: result.reviews,
		hasMore: result.hasNextPage,
		page: result.page,
	};
}

export interface LoadMoreMyReviewsResult {
	reviews: MyReviewView[];
	hasMore: boolean;
	page: number;
}

/**
 * Следующая страница личного списка «Мои отзывы».
 *
 * Пользователь определяется на сервере (getCurrentUser), а не приходит
 * параметром: иначе достаточно было бы подставить чужой id, чтобы прочитать
 * чужие отзывы — включая отклонённые вместе с причиной отклонения.
 */
export async function loadMoreMyReviewsAction(
	page: number,
	status?: string | null,
): Promise<LoadMoreMyReviewsResult> {
	const user = await getCurrentUser();
	if (!user) return { reviews: [], hasMore: false, page: 1 };

	const safeStatus =
		status === "approved" || status === "pending" || status === "rejected"
			? status
			: null;

	const result = await getUserReviews(String(user.id), {
		page: safePageNumber(page),
		limit: MY_PAGE_SIZE,
		status: safeStatus,
	});

	return {
		reviews: result.reviews,
		hasMore: result.hasNextPage,
		page: result.page,
	};
}
