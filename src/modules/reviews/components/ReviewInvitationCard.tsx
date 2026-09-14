"use client";

import { ArrowUpRight, PackageX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { ReviewInvitation } from "@/payload/services/reviews.service";
import { formatReviewShortDate } from "../lib/format";
import styles from "./Reviews.module.css";
import { StarRatingInput } from "./StarRatingInput";

interface ReviewInvitationCardProps {
	invitation: ReviewInvitation;
	index: number;
	/** Открыть форму отзыва; rating — оценка, выбранная прямо на карточке. */
	onRate: (invitation: ReviewInvitation, rating: number) => void;
}

/**
 * Карточка товара, о котором можно высказаться.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЗВЁЗДЫ, А НЕ КНОПКА «ОСТАВИТЬ ОТЗЫВ»
 * ────────────────────────────────────────────────────────────────────────────
 * Кнопка открывает пустую форму, где первым делом всё равно нужно выбрать
 * оценку — то есть добавляет шаг, ничего не давая взамен. Звёзды прямо на
 * карточке и есть этот первый шаг: нажатие и открывает форму, и заполняет в
 * ней оценку. Дальше остаётся только текст.
 *
 * Кнопка при этом никуда не делась — она рядом, для тех, кто хочет сперва
 * прочитать форму. Звёзды не единственный путь: полагаться на то, что
 * человек догадается нажать на них, было бы самонадеянно.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО СКАЗАНО НА КАРТОЧКЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Дата покупки — САМОЙ СВЕЖЕЙ: по ней человек опознаёт товар среди похожих.
 * Число заказов показывается только со второго: «1 заказ» под каждой
 * карточкой — шум, который перестаёт читаться. Количество единиц не
 * показывается вовсе — оценка не зависит от того, взяли одну штуку или пять.
 */
export function ReviewInvitationCard({
	invitation,
	index,
	onRate,
}: ReviewInvitationCardProps) {
	const { product, lastPurchasedAt, ordersCount } = invitation;

	const productFrame = (
		<span className={styles.productFrame}>
			{product.imageUrl ? (
				<Image
					src={product.imageUrl}
					alt=""
					fill
					sizes="44px"
					className={styles.productImage}
				/>
			) : (
				<span className={styles.productEmpty}>
					<PackageX size={16} aria-hidden />
				</span>
			)}
		</span>
	);

	const productBody = (
		<>
			{productFrame}
			<span className={styles.productBody}>
				<span className={styles.productLabel}>Ваша покупка</span>
				<span className={styles.rowProductName}>
					<span className={styles.productName}>{product.title}</span>
					{product.href && (
						<ArrowUpRight
							size={14}
							aria-hidden
							className={styles.rowProductArrow}
						/>
					)}
				</span>
			</span>
		</>
	);

	return (
		<li
			className={`${styles.card} ${styles.inviteCard} ${styles.enter}`}
			style={{ "--i": Math.min(index, 9) } as CSSProperties}
		>
			{/* Товар может остаться без ЧПУ (не прошёл бэкофилл slug) — тогда
			    карточка не ссылка, но оценить товар всё равно можно. */}
			{product.href ? (
				<Link href={product.href} className={styles.product}>
					{productBody}
				</Link>
			) : (
				<div className={`${styles.product} ${styles.productPlain}`}>
					{productBody}
				</div>
			)}

			<p className={styles.inviteMeta}>
				<time dateTime={lastPurchasedAt}>
					{formatReviewShortDate(lastPurchasedAt)}
				</time>
				{ordersCount > 1 && (
					<>
						<span aria-hidden>·</span>
						<span>в {ordersCount} заказах</span>
					</>
				)}
			</p>

			<div className={styles.inviteFoot}>
				<StarRatingInput
					value={0}
					size={20}
					showHint={false}
					onChange={(rating) => onRate(invitation, rating)}
					label={`Оценить товар «${product.title}»`}
				/>
				<button
					type="button"
					onClick={() => onRate(invitation, 0)}
					className={`${styles.btn} ${styles.btnQuiet} ${styles.inviteBtn}`}
				>
					Оставить отзыв
				</button>
			</div>
		</li>
	);
}

export default ReviewInvitationCard;
