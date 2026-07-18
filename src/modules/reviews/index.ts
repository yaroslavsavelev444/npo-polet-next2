export { RatingSummary } from "./components/RatingSummary";
export { ReviewCard } from "./components/ReviewCard";
export { ReviewForm } from "./components/ReviewForm";
export { ReviewFormDialog } from "./components/ReviewFormDialog";
export { ReviewsSection } from "./components/ReviewsSection";
export { StarRating } from "./components/StarRating";
export { StarRatingInput } from "./components/StarRatingInput";
export { pluralizeReviews } from "./lib/format";
// ВНИМАНИЕ: серверный сборщик данных (getReviewsSectionData) тянет за собой
// reviews.service → payload.db и НЕ должен попадать в клиентский бандл.
// Он экспортируется отдельно из "@/modules/reviews/server" — импортируйте его
// только из серверных компонентов.

export type {
	RatingAggregate,
	RatingBreakdown,
	ReviewEligibility,
	ReviewsSectionData,
	ReviewView,
} from "./types";
