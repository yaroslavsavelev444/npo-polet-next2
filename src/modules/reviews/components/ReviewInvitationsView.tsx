"use client";

import { AlertCircle, Loader2, PackageCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import type { ReviewInvitation } from "@/payload/services/reviews.service";
import { loadMoreReviewInvitationsAction } from "../actions/fetch-reviews";
import { ReviewFormDialog } from "./ReviewFormDialog";
import { ReviewInvitationCard } from "./ReviewInvitationCard";
import styles from "./Reviews.module.css";

interface ReviewInvitationsViewProps {
	initialInvitations: ReviewInvitation[];
	initialHasMore: boolean;
	/** Сколько товаров ждут оценки всего — для подписи под списком. */
	totalDocs: number;
	/**
	 * Оставлял ли пользователь отзывы вообще — этим различаются два пустых
	 * состояния. Признак косвенный, но точный: отзыв невозможен без
	 * завершённой покупки (см. hasUserPurchasedProduct), поэтому «отзывы есть»
	 * равнозначно «завершённые заказы были». Отдельный запрос к заказам ради
	 * того же самого ответа не нужен.
	 */
	hasWrittenReviews: boolean;
}

/**
 * Раздел «Можно оценить».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОИСХОДИТ ПОСЛЕ ОТПРАВКИ ОТЗЫВА
 * ────────────────────────────────────────────────────────────────────────────
 * Карточка убирается из списка сразу, не дожидаясь перезагрузки: товар только
 * что перестал быть «неоценённым», и оставить его среди предложений значило
 * бы предложить оценить то, что человек оценил секунду назад.
 *
 * Следом идёт router.refresh(). Он нужен не списку — список уже верен, — а
 * счётчикам на панели разделов: «Можно оценить» должно уменьшиться, «На
 * модерации» вырасти. Считает их сервер, и сойтись они могут только там.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПУСТОЕ СОСТОЯНИЕ РАЗЛИЧАЕТ ДВА РАЗНЫХ СЛУЧАЯ
 * ────────────────────────────────────────────────────────────────────────────
 * «Вы всё оценили» и «вам пока нечего оценивать» — разные новости, и одна
 * формулировка на оба случая врёт в одном из них. Первый — похвала и тупик,
 * второй — повод показать дорогу в каталог. Различает их не длина списка, а
 * то, писал ли человек отзывы раньше.
 *
 * «Все ДОСТУПНЫЕ товары оценены» — формулировка выбрана точно: часть покупок
 * могла выйти из продажи, и такой товар в предложения не попадает вовсе.
 * Сказать «вы оценили все свои покупки» значило бы утверждать то, чего
 * система не проверяла.
 *
 * Отдельного состояния загрузки у первой страницы нет: она приходит с
 * сервера уже готовой. Крутится только догрузка следующих.
 */
export function ReviewInvitationsView({
	initialInvitations,
	initialHasMore,
	totalDocs,
	hasWrittenReviews,
}: ReviewInvitationsViewProps) {
	const router = useRouter();
	const [invitations, setInvitations] = useState(initialInvitations);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(initialHasMore);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/** Товар, форма отзыва о котором сейчас открыта, и выбранная на карточке оценка. */
	const [active, setActive] = useState<{
		invitation: ReviewInvitation;
		rating: number;
	} | null>(null);

	async function handleLoadMore() {
		setIsLoading(true);
		setError(null);
		try {
			const next = await loadMoreReviewInvitationsAction(page + 1);
			setInvitations((prev) => {
				// Отзыв, оставленный между страницами, сдвигает выдачу — товар с
				// границы страниц мог бы прийти повторно. Склейка по id товара
				// дешевле, чем пересчёт смещения.
				const seen = new Set(prev.map((item) => item.product.id));
				return [
					...prev,
					...next.invitations.filter((item) => !seen.has(item.product.id)),
				];
			});
			setPage(next.page);
			setHasMore(next.hasMore);
		} catch {
			setError("Не удалось загрузить товары. Попробуйте ещё раз.");
		} finally {
			setIsLoading(false);
		}
	}

	function handleSubmitted(productId: string) {
		setInvitations((prev) =>
			prev.filter((item) => item.product.id !== productId),
		);
		router.refresh();
	}

	if (invitations.length === 0) {
		return (
			<div className={styles.empty}>
				<Sparkles
					size={28}
					strokeWidth={1.25}
					aria-hidden
					className="text-[var(--border-light)]"
				/>
				<p className={styles.emptyTitle}>
					{hasWrittenReviews
						? "Все доступные товары оценены"
						: "Пока нечего оценивать"}
				</p>
				<p className={styles.emptyText}>
					{hasWrittenReviews
						? "Спасибо! Как только появится новый завершённый заказ, товар из него появится здесь."
						: "Оценить можно товар из завершённого заказа — он появится здесь сразу после получения."}
				</p>
				<Link
					href={hasWrittenReviews ? "/profile/reviews" : "/category"}
					className={`${styles.btn} ${hasWrittenReviews ? styles.btnQuiet : styles.btnPrimary}`}
				>
					{hasWrittenReviews ? (
						"К моим отзывам"
					) : (
						<>
							<PackageCheck size={15} aria-hidden />В каталог
						</>
					)}
				</Link>
			</div>
		);
	}

	return (
		<>
			{/* @container — как у публичной ленты: колонки сетки и раскладка
			    подвала карточки считаются от ширины САМОЙ сетки, а не окна.
			    Без обёртки сетка осталась бы в одну колонку на любом экране. */}
			<div className="@container">
				<ul className={styles.grid}>
					{invitations.map((invitation, index) => (
						<ReviewInvitationCard
							key={invitation.product.id}
							invitation={invitation}
							index={index % 10}
							onRate={(item, rating) => setActive({ invitation: item, rating })}
						/>
					))}
				</ul>
			</div>

			{error && (
				<p role="alert" className={styles.errorBox}>
					<AlertCircle
						size={15}
						aria-hidden
						className="mt-[0.1rem] shrink-0 text-[var(--error)]"
					/>
					{error}
				</p>
			)}

			{hasMore ? (
				<div className={styles.actions}>
					<button
						type="button"
						onClick={handleLoadMore}
						disabled={isLoading}
						className={`${styles.btn} ${styles.btnQuiet}`}
					>
						{isLoading && (
							<Loader2 size={15} aria-hidden className={styles.spin} />
						)}
						{isLoading ? "Загружаем…" : "Показать ещё"}
					</button>
				</div>
			) : (
				<div className={styles.tail}>
					<span aria-hidden className={styles.tailRule} />
					<p className={catalog.micro}>
						{totalDocs === 1
							? "1 товар ждёт вашей оценки"
							: `${totalDocs} ${pluralizeProducts(totalDocs)} ждут вашей оценки`}
					</p>
					<span aria-hidden className={styles.tailRule} />
				</div>
			)}

			{active && (
				<ReviewFormDialog
					open
					onClose={() => setActive(null)}
					productId={active.invitation.product.id}
					productTitle={active.invitation.product.title}
					initialRating={active.rating}
					onSuccess={() => handleSubmitted(active.invitation.product.id)}
				/>
			)}
		</>
	);
}

/** «2 товара», «5 товаров» — счётная форма для подписи под списком. */
function pluralizeProducts(count: number): string {
	const mod100 = count % 100;
	const mod10 = count % 10;
	if (mod100 >= 11 && mod100 <= 14) return "товаров";
	if (mod10 >= 2 && mod10 <= 4) return "товара";
	return "товаров";
}

export default ReviewInvitationsView;
