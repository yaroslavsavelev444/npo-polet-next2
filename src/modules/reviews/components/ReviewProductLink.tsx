import { ArrowUpRight, PackageX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReviewProductRef } from "@/payload/services/reviews.service";
import styles from "./Reviews.module.css";

interface ReviewProductLinkProps {
	product: ReviewProductRef | null;
	/** Подпись над названием: «товар» на публичной ленте, «мой отзыв о» — нет. */
	label?: string;
}

/**
 * Товар, о котором отзыв.
 *
 * Стоит первым и является ссылкой целиком: вне страницы товара отзыв без
 * указания, о чём он, бесполезен, а целиться в название не должно быть нужно
 * ни мышью, ни пальцем.
 *
 * Товар, которого больше нет в каталоге (связь не разрешилась или у него нет
 * slug), показывается без ссылки — название сохранено в самом отзыве, и он
 * остаётся осмысленным.
 */
export function ReviewProductLink({
	product,
	label = "Товар",
}: ReviewProductLinkProps) {
	if (!product) {
		return (
			<div className={`${styles.product} ${styles.productPlain}`}>
				<span className={styles.productFrame}>
					<span className={styles.productEmpty}>
						<PackageX size={16} aria-hidden />
					</span>
				</span>
				<span className={styles.productBody}>
					<span className={styles.productLabel}>{label}</span>
					<span className={styles.productName}>Товар больше недоступен</span>
				</span>
			</div>
		);
	}

	const frame = (
		<span className={styles.productFrame}>
			{product.imageUrl ? (
				<Image
					src={product.imageUrl}
					alt=""
					fill
					sizes="48px"
					className={styles.productImage}
				/>
			) : (
				<span className={styles.productEmpty}>
					<PackageX size={16} aria-hidden />
				</span>
			)}
		</span>
	);

	const body = (
		<span className={styles.productBody}>
			<span className={styles.productLabel}>{label}</span>
			<span className={styles.productName}>{product.title}</span>
		</span>
	);

	if (!product.href) {
		return (
			<div className={`${styles.product} ${styles.productPlain}`}>
				{frame}
				{body}
			</div>
		);
	}

	return (
		<Link href={product.href} className={styles.product}>
			{frame}
			{body}
			<ArrowUpRight size={15} aria-hidden className={styles.productArrow} />
		</Link>
	);
}

export default ReviewProductLink;
