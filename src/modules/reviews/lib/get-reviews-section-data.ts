import {
	getApprovedReviewsForProduct,
	getProductRatingBreakdown,
	getReviewEligibility,
} from "@/payload/services/reviews.service";
import type { ReviewsSectionData } from "../types";

const INITIAL_PAGE_SIZE = 10;

/**
 * Собирает всё, что нужно секции отзывов, за один заход на сервере:
 * агрегат рейтинга, первую страницу одобренных отзывов и право текущего
 * пользователя оставить отзыв. Вызывается из серверного компонента страницы
 * товара и передаётся в клиентскую ReviewsSection как props.
 */
export async function getReviewsSectionData(
	productId: string,
	productTitle: string,
	userId: string | number | null | undefined,
): Promise<ReviewsSectionData> {
	const [breakdown, firstPage, eligibility] = await Promise.all([
		getProductRatingBreakdown(productId),
		getApprovedReviewsForProduct(productId, {
			page: 1,
			limit: INITIAL_PAGE_SIZE,
		}),
		getReviewEligibility(userId, productId),
	]);

	return {
		productId,
		productTitle,
		breakdown,
		initialReviews: firstPage.reviews,
		totalReviews: firstPage.totalDocs,
		hasMore: firstPage.hasNextPage,
		eligibility,
		isAuthenticated: Boolean(userId),
	};
}
