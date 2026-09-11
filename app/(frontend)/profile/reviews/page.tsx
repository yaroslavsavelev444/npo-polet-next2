export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import {
	isValidMyReviewsFilter,
	type MyReviewsFilter,
	MyReviewsView,
	pluralizeRatings,
	REVIEW_STATUS_FILTERS,
	ReviewsHero,
	ReviewsRail,
	StarRating,
} from "@/modules/reviews";
import {
	getUserReviewStats,
	getUserReviews,
} from "@/payload/services/reviews.service";
import { PageContainer } from "@/shared/components/PageContainer";
import type { SegmentedTabItem } from "@/shared/components/segmented/SegmentedTabs";

export const metadata: Metadata = {
	title: "Мои отзывы",
	robots: { index: false, follow: false },
};

const PAGE_SIZE = 10;

const BREADCRUMBS = [
	{ title: "Главная", href: "/" },
	{ title: "Личный кабинет", href: "/profile" },
	{ title: "Мои отзывы", href: "/profile/reviews" },
];

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * «Мои отзывы» — раздел личного кабинета.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ АДРЕС /profile/reviews, А НЕ /reviews
 * ────────────────────────────────────────────────────────────────────────────
 * /reviews заняла публичная лента — и заняла по праву: именно туда ведёт
 * ссылка «Все отзывы» с главной, именно этот адрес должен индексироваться.
 * Личный список переехал под /profile, к остальным разделам кабинета, рядом с
 * /profile/delete-account. Ссылки в подвале, в меню пользователя, в мобильном
 * меню и в самом кабинете обновлены вместе с ним.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ЗДЕСЬ ВИДНО
 * ────────────────────────────────────────────────────────────────────────────
 * Свои отзывы в ЛЮБОМ статусе, включая отклонённые вместе с причиной: иначе
 * автор не узнает, почему его отзыва нет на сайте. Это же правило записано в
 * access коллекции product-reviews.
 *
 * Действий над отзывом нет — и это не упущение: update и delete в коллекции
 * закрыты за администратором, у автора таких прав не существует. Разбор — в
 * шапке MyReviewRow.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Два независимых запроса одним Promise.all: страница списка и счётчики по
 * статусам. Счётчики считаются одним SQL вместо четырёх payload.count.
 */
export default async function MyReviewsPage({ searchParams }: PageProps) {
	const user = await getCurrentUser();
	if (!user) redirect("/auth/login?from=/profile/reviews");

	const raw = (await searchParams).status;
	const key = Array.isArray(raw) ? raw[0] : raw;
	const filter: MyReviewsFilter = isValidMyReviewsFilter(key) ? key : "all";

	const [page, stats] = await Promise.all([
		getUserReviews(String(user.id), {
			page: 1,
			limit: PAGE_SIZE,
			status: filter === "all" ? null : filter,
		}),
		getUserReviewStats(String(user.id)),
	]);

	const items: SegmentedTabItem<MyReviewsFilter>[] = REVIEW_STATUS_FILTERS.map(
		(item) => ({
			key: item.key,
			label: item.label,
			count: item.key === "all" ? stats.total : stats.byStatus[item.key],
		}),
	);

	return (
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<ReviewsHero
				titleLines={["Мои", "отзывы"]}
				breadcrumbs={BREADCRUMBS}
				aside={
					stats.total > 0 ? (
						/* Сводка личная, а не рейтинговая: средняя оценка, которую
						   поставил сам пользователь, и сколько отзывов ещё проверяют.
						   Распределение по звёздам здесь было бы про чужие отзывы. */
						<div className="flex flex-wrap gap-[1.5rem_2.5rem]">
							<div className="flex flex-col gap-[0.4rem]">
								<span className="font-[var(--font-mono),ui-monospace,monospace] text-[1.75rem] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
									{stats.total}
								</span>
								<span className={catalog.micro}>отзывов оставлено</span>
							</div>

							<div className="flex flex-col gap-[0.4rem]">
								<span className="flex items-center gap-[0.5rem]">
									<span className="font-[var(--font-mono),ui-monospace,monospace] text-[1.75rem] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
										{stats.averageGiven.toFixed(1).replace(".", ",")}
									</span>
									<StarRating value={stats.averageGiven} size={14} />
								</span>
								<span className={catalog.micro}>
									средняя {pluralizeRatings(stats.total)}
								</span>
							</div>

							{stats.byStatus.pending > 0 && (
								<div className="flex flex-col gap-[0.4rem]">
									<span className="font-[var(--font-mono),ui-monospace,monospace] text-[1.75rem] font-semibold leading-none tabular-nums text-[var(--warning)]">
										{stats.byStatus.pending}
									</span>
									<span className={catalog.micro}>на модерации</span>
								</div>
							)}
						</div>
					) : (
						<p className="max-w-[46ch] text-[0.9375rem] leading-[1.6] text-[var(--text-secondary)]">
							Здесь собраны ваши отзывы о товарах — вместе со статусом проверки
							и причиной, если отзыв отклонили.
						</p>
					)
				}
			/>

			<PageContainer className="pb-[4rem]">
				<div className="flex flex-col">
					<ReviewsRail
						paramName="status"
						allKey="all"
						value={filter}
						items={items}
						label="Отбор отзывов по статусу"
						totalDocs={page.totalDocs}
						countLabel="в разделе"
					/>

					<div className="mt-[1.5rem] sm:mt-[2rem]">
						<MyReviewsView
							key={filter}
							initialReviews={page.reviews}
							initialHasMore={page.hasNextPage}
							totalDocs={page.totalDocs}
							filter={filter}
						/>
					</div>
				</div>
			</PageContainer>
		</main>
	);
}
