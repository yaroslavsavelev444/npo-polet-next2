export { MyReviewRow } from "./components/MyReviewRow";
export { MyReviewsView } from "./components/MyReviewsView";
export { PublicReviewCard } from "./components/PublicReviewCard";
export { PublicReviewsView } from "./components/PublicReviewsView";
export { RatingSummary } from "./components/RatingSummary";
export { ReviewCard } from "./components/ReviewCard";
export { ReviewComment } from "./components/ReviewComment";
export { ReviewForm } from "./components/ReviewForm";
export { ReviewFormDialog } from "./components/ReviewFormDialog";
export { ReviewProductLink } from "./components/ReviewProductLink";
export { ReviewProsCons } from "./components/ReviewProsCons";
export { ReviewStatusBadge } from "./components/ReviewStatusBadge";
export { ReviewsHero } from "./components/ReviewsHero";
export { ReviewsRail } from "./components/ReviewsRail";
export { ReviewsSection } from "./components/ReviewsSection";
export { StarRating } from "./components/StarRating";
export { StarRatingInput } from "./components/StarRatingInput";

export {
	formatReviewDate,
	formatReviewShortDate,
	isLongComment,
	pluralizeRatings,
	pluralizeReviews,
	REVIEW_CLAMP_CHARS,
	reviewInitials,
} from "./lib/format";
export {
	isValidMyReviewsFilter,
	type MyReviewsFilter,
	REVIEW_STATUS_FILTERS,
	REVIEW_STATUS_VIEW,
	type ReviewStatusView,
} from "./lib/status-view";

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
