import { BadgeCheck } from "lucide-react";
import { formatReviewDate } from "../lib/format";
import type { ReviewView } from "../types";
import { StarRating } from "./StarRating";

interface ReviewCardProps {
	review: ReviewView;
}

export function ReviewCard({ review }: ReviewCardProps) {
	const initial = review.authorName.charAt(0).toUpperCase() || "?";

	return (
		<article className="flex flex-col gap-3 border-b border-[var(--border)] py-5 first:pt-0 last:border-0">
			<header className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-3">
					<span
						className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-sm font-semibold text-[var(--text-primary)]"
						aria-hidden
					>
						{initial}
					</span>
					<div className="flex flex-col gap-0.5">
						<span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
							{review.authorName}
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
