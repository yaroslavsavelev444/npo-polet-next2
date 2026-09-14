export { MyReviewRow } from "./components/MyReviewRow";
export { MyReviewsView } from "./components/MyReviewsView";
export { PublicReviewCard } from "./components/PublicReviewCard";
export { PublicReviewsView } from "./components/PublicReviewsView";
export { RatingSummary } from "./components/RatingSummary";
export { ReviewCard } from "./components/ReviewCard";
export { ReviewComment } from "./components/ReviewComment";
export { ReviewForm } from "./components/ReviewForm";
export { ReviewFormDialog } from "./components/ReviewFormDialog";
export { ReviewInvitationCard } from "./components/ReviewInvitationCard";
export { ReviewInvitationsView } from "./components/ReviewInvitationsView";
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
	isValidMyReviewsSection,
	type MyReviewsFilter,
	type MyReviewsSection,
	REVIEW_SECTIONS,
	REVIEW_STATUS_VIEW,
	type ReviewStatusView,
	sectionToFilter,
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
