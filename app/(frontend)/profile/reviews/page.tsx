export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import {
	isValidMyReviewsSection,
	type MyReviewsSection,
	MyReviewsView,
	pluralizeRatings,
	REVIEW_SECTIONS,
	ReviewInvitationsView,
	ReviewsHero,
	ReviewsRail,
	StarRating,
	sectionToFilter,
} from "@/modules/reviews";
import {
	countReviewInvitations,
	getReviewInvitations,
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
/** Предложения идут сеткой по три — страница крупнее, чем у списка отзывов. */
const INVITATIONS_PAGE_SIZE = 12;

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
 * РАЗДЕЛ «МОЖНО ОЦЕНИТЬ»
 * ────────────────────────────────────────────────────────────────────────────
 * Первая позиция панели — не отзывы, а товары, о которых отзыва ещё нет.
 * Место выбрано по задаче: остальные разделы показывают уже сделанное, этот
 * единственный просит что-то сделать (см. REVIEW_SECTIONS).
 *
 * Предложения нигде не хранятся — они вычисляются из заказов, товаров и
 * отзывов на лету (getReviewInvitations). Почему именно так, а не таблицей
 * предложений, разобрано в шапке этой выборки.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Независимые запросы одним Promise.all. Счётчики по статусам считаются одним
 * SQL вместо четырёх payload.count; счётчик предложений — ещё одним, и он
 * нужен панели в любом разделе. Тяжёлые выдачи (список отзывов и список
 * предложений) запрашиваются по одной: показывается всегда ровно одна из них.
 */
export default async function MyReviewsPage({ searchParams }: PageProps) {
	const user = await getCurrentUser();
	if (!user) redirect("/auth/login?from=/profile/reviews");

	const raw = (await searchParams).status;
	const key = Array.isArray(raw) ? raw[0] : raw;
	const section: MyReviewsSection = isValidMyReviewsSection(key) ? key : "all";
	const showInvitations = section === "to-review";

	// Счётчик предложений нужен панели ВСЕГДА — он стоит на ней рядом с
	// подписью и в тех разделах, где сам список предложений не показывается.
	// Сама выдача предложений запрашивается только в своём разделе: тянуть её
	// на страницу написанных отзывов означало бы платить за то, чего не видно.
	const filter = sectionToFilter(section);

	const [page, stats, invitationsCount, invitations] = await Promise.all([
		showInvitations
			? null
			: getUserReviews(String(user.id), {
					page: 1,
					limit: PAGE_SIZE,
					status: filter === "all" ? null : filter,
				}),
		getUserReviewStats(String(user.id)),
		countReviewInvitations(String(user.id)),
		showInvitations
			? getReviewInvitations(String(user.id), {
					page: 1,
					limit: INVITATIONS_PAGE_SIZE,
				})
			: null,
	]);

	const items: SegmentedTabItem<MyReviewsSection>[] = REVIEW_SECTIONS.map(
		(item) => ({
			key: item.key,
			label: item.label,
			count:
				item.key === "to-review"
					? invitationsCount
					: item.key === "all"
						? stats.total
						: stats.byStatus[item.key],
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
					stats.total > 0 || invitationsCount > 0 ? (
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

							{/* Сводка первого экрана — единственное место, где о
							    предложениях узнаёт тот, кто открыл другой раздел. */}
							{invitationsCount > 0 && (
								<div className="flex flex-col gap-[0.4rem]">
									<span className="font-[var(--font-mono),ui-monospace,monospace] text-[1.75rem] font-semibold leading-none tabular-nums text-[var(--accent)]">
										{invitationsCount}
									</span>
									<span className={catalog.micro}>можно оценить</span>
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
						value={section}
						items={items}
						label="Разделы моих отзывов"
						totalDocs={
							showInvitations ? invitationsCount : (page?.totalDocs ?? 0)
						}
						countLabel="в разделе"
					/>

					<div className="mt-[1.5rem] sm:mt-[2rem]">
						{/* key на разделе: у обоих списков есть состояние подгруженных
						    страниц, и без сброса переключение показало бы догруженное
						    из прошлого раздела. */}
						{showInvitations ? (
							<ReviewInvitationsView
								key="to-review"
								initialInvitations={invitations?.invitations ?? []}
								initialHasMore={invitations?.hasNextPage ?? false}
								totalDocs={invitationsCount}
								hasWrittenReviews={stats.total > 0}
							/>
						) : (
							<MyReviewsView
								key={filter}
								initialReviews={page?.reviews ?? []}
								initialHasMore={page?.hasNextPage ?? false}
								totalDocs={page?.totalDocs ?? 0}
								filter={filter}
							/>
						)}
					</div>
				</div>
			</PageContainer>
		</main>
	);
}
