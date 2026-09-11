import { AlertCircle, ArrowUpRight, Clock, PackageX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { MyReviewView } from "@/payload/services/reviews.service";
import { formatReviewDate } from "../lib/format";
import { REVIEW_STATUS_VIEW } from "../lib/status-view";
import { ReviewComment } from "./ReviewComment";
import { ReviewProsCons } from "./ReviewProsCons";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import styles from "./Reviews.module.css";
import { StarRating } from "./StarRating";

interface MyReviewRowProps {
	review: MyReviewView;
	index: number;
}

/**
 * Собственный отзыв в личном списке.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ ГЛАВНОЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Не текст отзыва — его автор и так помнит, — а СТАТУС: опубликован ли он,
 * ждёт ли модерации, отклонён ли и почему. Поэтому статус стоит в шапке
 * строки, справа от товара, и сопровождается пояснением там, где пояснение
 * что-то добавляет.
 *
 * Пояснение показывается только у незавершённых состояний. Под опубликованным
 * отзывом строка «виден всем на странице товара» — шум: это и так понятно из
 * подписи, а повторённая под каждым отзывом она перестаёт читаться вовсе.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ
 * ────────────────────────────────────────────────────────────────────────────
 * Ни правки, ни удаления. Это не упущение: в коллекции product-reviews update
 * и delete закрыты за isAdminOrSuperAdmin (см. Reviews.ts), то есть у автора
 * таких прав нет вовсе. Кнопка, которая при нажатии получила бы отказ, — хуже
 * её отсутствия.
 */
export function MyReviewRow({ review, index }: MyReviewRowProps) {
	const statusView = REVIEW_STATUS_VIEW[review.status];
	const product = review.product;
	const showNote = review.status !== "approved";

	const productBody = (
		<>
			<span className={styles.productLabel}>Отзыв о товаре</span>
			<span className={styles.rowProductName}>
				<span className={styles.productName}>
					{product?.title ?? "Товар больше недоступен"}
				</span>
				{product?.href && (
					<ArrowUpRight
						size={14}
						aria-hidden
						className={styles.rowProductArrow}
					/>
				)}
			</span>
		</>
	);

	return (
		<li
			className={`${styles.row} ${styles.enter}`}
			style={{ "--i": Math.min(index, 9) } as CSSProperties}
		>
			<div className={styles.rowFrame}>
				{product?.imageUrl ? (
					<Image
						src={product.imageUrl}
						alt=""
						fill
						sizes="64px"
						className={styles.productImage}
					/>
				) : (
					<span className={styles.productEmpty}>
						<PackageX size={18} aria-hidden />
					</span>
				)}
			</div>

			<div className={styles.rowHead}>
				<div className="flex min-w-0 flex-col">
					{product?.href ? (
						<Link href={product.href} className={styles.rowProductLink}>
							{productBody}
						</Link>
					) : (
						<span className={styles.rowProductLink}>{productBody}</span>
					)}

					<p className={`${styles.rating} ${styles.rowMeta}`}>
						<StarRating value={review.rating} size={14} />
						<span className={styles.ratingValue}>{review.rating} из 5</span>
						<time dateTime={review.createdAt} className={styles.date}>
							{formatReviewDate(review.createdAt)}
						</time>
					</p>
				</div>

				<ReviewStatusBadge status={review.status} />
			</div>

			<div className={styles.rowBody}>
				{review.title && <h3 className={styles.title}>{review.title}</h3>}

				<ReviewComment comment={review.comment} />

				<ReviewProsCons pros={review.pros} cons={review.cons} />

				{showNote && (
					<p
						className={`${styles.note} ${
							review.status === "rejected"
								? styles.noteRejected
								: styles.notePending
						}`}
					>
						{review.status === "rejected" ? (
							<AlertCircle
								size={15}
								aria-hidden
								className={`${styles.noteIcon} ${styles.noteRejectedIcon}`}
							/>
						) : (
							<Clock
								size={15}
								aria-hidden
								className={`${styles.noteIcon} ${styles.notePendingIcon}`}
							/>
						)}
						<span>
							{statusView.hint}
							{review.status === "rejected" && review.rejectionReason && (
								<>
									{" "}
									<strong className="font-semibold text-[var(--text-primary)]">
										Причина:
									</strong>{" "}
									{review.rejectionReason}
								</>
							)}
						</span>
					</p>
				)}
			</div>
		</li>
	);
}

export default MyReviewRow;
