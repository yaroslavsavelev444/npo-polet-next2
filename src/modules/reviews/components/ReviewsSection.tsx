"use client";

import {
	CheckCircle2,
	Clock,
	Lock,
	MessageSquarePlus,
	PenLine,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, Empty } from "@/UI";
import { loadMoreReviewsAction } from "../actions/fetch-reviews";
import { pluralizeReviews } from "../lib/format";
import type {
	ReviewEligibilityReason,
	ReviewsSectionData,
	ReviewView,
} from "../types";
import { RatingSummary } from "./RatingSummary";
import { ReviewCard } from "./ReviewCard";
import { ReviewFormDialog } from "./ReviewFormDialog";

/**
 * Клиентская секция отзывов на странице товара. Получает подготовленные на
 * сервере данные (первую страницу отзывов, агрегат, право на отзыв) и
 * управляет: догрузкой отзывов, открытием модалки формы и отображением
 * состояния «отзыв отправлен на модерацию» без перезагрузки страницы.
 */
export function ReviewsSection({ data }: { data: ReviewsSectionData }) {
	const {
		productId,
		productTitle,
		breakdown,
		initialReviews,
		hasMore: initialHasMore,
		eligibility,
		isAuthenticated,
	} = data;

	const [reviews, setReviews] = useState<ReviewView[]>(initialReviews);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(initialHasMore);
	const [isLoading, setIsLoading] = useState(false);
	const [dialogOpen, setDialogOpen] = useState(false);
	// Локально отражаем факт отправки, чтобы CTA сразу стал «на модерации».
	const [justSubmitted, setJustSubmitted] = useState(false);

	const hasReviews = breakdown.count > 0;

	async function handleLoadMore() {
		setIsLoading(true);
		try {
			const next = await loadMoreReviewsAction(productId, page + 1);
			setReviews((prev) => {
				const seen = new Set(prev.map((r) => r.id));
				return [...prev, ...next.reviews.filter((r) => !seen.has(r.id))];
			});
			setPage(next.page);
			setHasMore(next.hasMore);
		} finally {
			setIsLoading(false);
		}
	}

	const effectiveReason: ReviewEligibilityReason = justSubmitted
		? "already_reviewed"
		: eligibility.reason;
	const effectiveStatus = justSubmitted
		? "pending"
		: eligibility.existingReviewStatus;

	return (
		<section className="flex flex-col gap-8">
			{/* ── Верхний блок: сводка рейтинга + призыв оставить отзыв ── */}
			<div className="flex flex-col gap-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
				{hasReviews ? (
					<RatingSummary breakdown={breakdown} />
				) : (
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-[var(--text-primary)]">
							Отзывов пока нет
						</p>
						<p className="text-sm text-[var(--text-muted)]">
							Станьте первым, кто оставит отзыв об этом товаре.
						</p>
					</div>
				)}

				<div className="shrink-0 lg:w-64">
					<ReviewCTA
						reason={effectiveReason}
						status={effectiveStatus}
						isAuthenticated={isAuthenticated}
						onWrite={() => setDialogOpen(true)}
					/>
				</div>
			</div>

			{/* ── Список отзывов ── */}
			{hasReviews && (
				<div className="flex flex-col">
					<h3 className="mb-1 text-sm font-medium text-[var(--text-muted)]">
						{breakdown.count} {pluralizeReviews(breakdown.count)}
					</h3>
					{reviews.map((review) => (
						<ReviewCard key={review.id} review={review} />
					))}

					{hasMore && (
						<div className="mt-6 flex justify-center">
							<Button
								variant="outline"
								onClick={handleLoadMore}
								loading={isLoading}
								disabled={isLoading}
							>
								Показать ещё
							</Button>
						</div>
					)}
				</div>
			)}

			<ReviewFormDialog
				open={dialogOpen}
				onClose={() => setDialogOpen(false)}
				productId={productId}
				productTitle={productTitle}
				onSuccess={() => setJustSubmitted(true)}
			/>
		</section>
	);
}

function ReviewCTA({
	reason,
	status,
	isAuthenticated,
	onWrite,
}: {
	reason: ReviewEligibilityReason;
	status: string | null;
	isAuthenticated: boolean;
	onWrite: () => void;
}) {
	if (reason === "eligible") {
		return (
			<Button
				fullWidth
				onClick={onWrite}
				leftIcon={<PenLine className="h-4 w-4" />}
			>
				Оставить отзыв
			</Button>
		);
	}

	if (reason === "not_authenticated" || !isAuthenticated) {
		return (
			<div className="flex flex-col gap-2">
				<Link href="/auth/login" className="block">
					<Button
						fullWidth
						variant="outline"
						leftIcon={<Lock className="h-4 w-4" />}
					>
						Войти, чтобы оставить отзыв
					</Button>
				</Link>
				<p className="text-center text-xs text-[var(--text-muted)]">
					Отзыв можно оставить после покупки товара
				</p>
			</div>
		);
	}

	if (reason === "not_purchased") {
		return (
			<Note
				icon={<MessageSquarePlus className="h-5 w-5" />}
				title="Отзыв после покупки"
				text="Оставить отзыв можно только на купленный товар из завершённого заказа."
			/>
		);
	}

	// already_reviewed
	if (status === "approved") {
		return (
			<Note
				icon={<CheckCircle2 className="h-5 w-5 text-[var(--success)]" />}
				title="Ваш отзыв опубликован"
				text="Спасибо за обратную связь!"
			/>
		);
	}
	if (status === "rejected") {
		return (
			<Note
				icon={<Lock className="h-5 w-5 text-[var(--error)]" />}
				title="Отзыв отклонён"
				text="Ваш отзыв не прошёл модерацию."
			/>
		);
	}
	return (
		<Note
			icon={<Clock className="h-5 w-5 text-[var(--warning)]" />}
			title="Отзыв на модерации"
			text="Мы проверим ваш отзыв и опубликуем его после одобрения."
		/>
	);
}

function Note({
	icon,
	title,
	text,
}: {
	icon: React.ReactNode;
	title: string;
	text: string;
}) {
	return (
		<div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
			<span className="mt-0.5 shrink-0 text-[var(--text-muted)]">{icon}</span>
			<div className="flex flex-col gap-0.5">
				<p className="text-sm font-medium text-[var(--text-primary)]">
					{title}
				</p>
				<p className="text-xs leading-relaxed text-[var(--text-muted)]">
					{text}
				</p>
			</div>
		</div>
	);
}
