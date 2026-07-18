import type {
	RatingBreakdown,
	ReviewEligibility,
	ReviewView,
} from "@/payload/services/reviews.service";

export type {
	RatingAggregate,
	RatingBreakdown,
	ReviewEligibility,
	ReviewEligibilityReason,
	ReviewsPage,
	ReviewView,
} from "@/payload/services/reviews.service";

/** Данные отзывов, подготовленные на сервере и переданные в клиентскую секцию. */
export interface ReviewsSectionData {
	productId: string;
	productTitle: string;
	breakdown: RatingBreakdown;
	initialReviews: ReviewView[];
	totalReviews: number;
	hasMore: boolean;
	eligibility: ReviewEligibility;
	/** Авторизован ли посетитель (для выбора текста CTA). */
	isAuthenticated: boolean;
}

export type ReviewActionResult =
	| { success: true }
	| {
			success: false;
			error: string;
			code?:
				| "validation"
				| "not_authenticated"
				| "not_purchased"
				| "already_reviewed"
				| "rate_limited"
				| "server_error";
	  };
