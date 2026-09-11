import { BadgeCheck } from "lucide-react";
import type { CSSProperties } from "react";
import type { PublicReviewView } from "@/payload/services/reviews.service";
import { formatReviewShortDate, reviewInitials } from "../lib/format";
import { ReviewComment } from "./ReviewComment";
import { ReviewProductLink } from "./ReviewProductLink";
import styles from "./Reviews.module.css";
import { StarRating } from "./StarRating";

interface PublicReviewCardProps {
	review: PublicReviewView;
	index: number;
}

/**
 * Отзыв в публичной ленте.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОРЯДОК ЧТЕНИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Товар → оценка → что сказали → кто и когда. Товар первым потому, что вне
 * страницы товара отзыв без указания, о чём он, не значит ничего: посетитель
 * сначала решает, интересен ли ему этот товар, и только потом читает.
 *
 * Подпись автора внизу, а не сверху: на публичной странице важно, ЧТО
 * написано, а не кем, — имя здесь подтверждает, что писал человек, и этого
 * достаточно.
 *
 * Имя приходит уже сокращённым до инициала фамилии (см. formatAuthorName в
 * reviews.service): публиковать полное ФИО покупателя нельзя.
 */
export function PublicReviewCard({ review, index }: PublicReviewCardProps) {
	return (
		<li
			className={styles.enter}
			style={{ "--i": Math.min(index, 11) } as CSSProperties}
		>
			<article className={styles.card}>
				<ReviewProductLink product={review.product} label="Отзыв о товаре" />

				<div className={styles.body}>
					<p className={styles.rating}>
						<StarRating value={review.rating} size={15} />
						<span className={styles.ratingValue}>{review.rating} из 5</span>
					</p>

					{review.title && <h3 className={styles.title}>{review.title}</h3>}

					<ReviewComment comment={review.comment} />
				</div>

				<footer className={styles.foot}>
					<span className={styles.author}>
						<span className={styles.avatar} aria-hidden>
							{reviewInitials(review.authorName)}
						</span>
						<span className={styles.authorName}>{review.authorName}</span>
					</span>

					{review.isVerifiedPurchase && (
						<span className={styles.verified}>
							<BadgeCheck size={12} aria-hidden />
							Покупка подтверждена
						</span>
					)}

					<span className={styles.footSpacer} />

					<time dateTime={review.createdAt} className={styles.date}>
						{formatReviewShortDate(review.createdAt)}
					</time>
				</footer>
			</article>
		</li>
	);
}

export default PublicReviewCard;
