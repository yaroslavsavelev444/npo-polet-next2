import { BadgeCheck, UserRound } from "lucide-react";
import { formatReviewDate, REVIEW_AUTHOR_LABEL } from "../lib/format";
import type { ReviewView } from "../types";
import { StarRating } from "./StarRating";

interface ReviewCardProps {
	review: ReviewView;
}

export function ReviewCard({ review }: ReviewCardProps) {
	return (
		<article className="flex flex-col gap-3 border-b border-[var(--hairline)] py-5 first:pt-0 last:border-0">
			<header className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-3">
					<span
						className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-sm font-semibold text-[var(--text-primary)]"
						aria-hidden
					>
						<UserRound className="h-4 w-4 text-[var(--text-secondary)]" />
					</span>
					<div className="flex flex-col gap-0.5">
						<span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
							{REVIEW_AUTHOR_LABEL}
							{review.isVerifiedPurchase && (
								<span
									className="inline-flex items-center gap-1 text-xs font-normal text-[var(--success)]"
									title="Отзыв подтверждён покупкой"
								>
									<BadgeCheck className="h-3.5 w-3.5" aria-hidden />
									<span className="hidden sm:inline">Покупка подтверждена</span>
								</span>
							)}
						</span>
						<time
							className="text-xs text-[var(--text-muted)]"
							dateTime={review.createdAt}
						>
							{formatReviewDate(review.createdAt)}
						</time>
					</div>
				</div>
				<StarRating value={review.rating} size={15} />
			</header>

			{review.title && (
				<h4 className="text-sm font-semibold text-[var(--text-primary)]">
					{review.title}
				</h4>
			)}

			<p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
				{review.comment}
			</p>
		</article>
	);
}
