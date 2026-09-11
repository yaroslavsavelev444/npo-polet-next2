export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import {
	PublicReviewsView,
	pluralizeReviews,
	RatingSummary,
	ReviewsHero,
	ReviewsRail,
} from "@/modules/reviews";
import {
	getApprovedReviewsFeed,
	getGlobalRatingBreakdown,
} from "@/payload/services/reviews.service";
import { baseURL } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";
import { PageContainer } from "@/shared/components/PageContainer";
import type { SegmentedTabItem } from "@/shared/components/segmented/SegmentedTabs";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";

const PAGE_PATH = "/reviews";
const PAGE_URL = `${baseURL}${PAGE_PATH}`;
const PAGE_SIZE = 12;

const DESCRIPTION =
	"Отзывы покупателей о продукции НПО «Полёт»: оценки, комментарии и подтверждённые покупки. Все отзывы проходят модерацию.";

export const metadata: Metadata = {
	title: "Наши отзывы",
	description: DESCRIPTION,
	alternates: { canonical: PAGE_URL },
	openGraph: {
		title: "Наши отзывы",
		description: DESCRIPTION,
		url: PAGE_URL,
		type: "website",
	},
};

const BREADCRUMBS = [
	{ title: "Главная", href: "/" },
	{ title: "Отзывы", href: PAGE_PATH },
];

type RatingFilter = "all" | "5" | "4" | "3" | "2" | "1";

const RATING_KEYS: RatingFilter[] = ["all", "5", "4", "3", "2", "1"];

function parseRating(value: string | string[] | undefined): RatingFilter {
	const key = Array.isArray(value) ? value[0] : value;
	return RATING_KEYS.includes(key as RatingFilter)
		? (key as RatingFilter)
		: "all";
}

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * «Наши отзывы» — публичная лента отзывов о всей продукции.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО СЮДА ПОПАДАЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Только отзывы со статусом `approved` — фильтр стоит в самом сервисе
 * (getApprovedReviewsFeed), а не полагается на права запроса. Ни отзыв на
 * модерации, ни отклонённый вместе с причиной отклонения сюда попасть не
 * может ни при каком вводе: параметр адреса управляет только оценкой.
 *
 * Имя автора приходит уже сокращённым до инициала фамилии (formatAuthorName в
 * reviews.service) — публиковать полное ФИО покупателя нельзя.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОТБОР ПО ОЦЕНКЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Единственный отбор, который здесь нужен. Читают отзывы чаще всего не ради
 * пятёрок, а чтобы понять, за что снижали оценку, — и счётчики на сегментах
 * сразу показывают, есть ли там что читать. Счётчики бесплатны: они приходят
 * из того же распределения, что и сводка первого экрана.
 *
 * Сортировки нет намеренно. Свежие сверху — единственный честный порядок для
 * ленты отзывов; «сначала лучшие» превратили бы страницу доверия в витрину
 * пятёрок.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Два независимых запроса одним Promise.all: страница ленты и сводный
 * рейтинг. Сводка кэшируется тегом "reviews" — тем же, который сбрасывает хук
 * коллекции при смене статуса отзыва.
 */
export default async function PublicReviewsPage({ searchParams }: PageProps) {
	const ratingKey = parseRating((await searchParams).rating);
	const rating = ratingKey === "all" ? null : Number(ratingKey);

	const [feed, breakdown] = await Promise.all([
		getApprovedReviewsFeed({ page: 1, limit: PAGE_SIZE, rating }),
		getGlobalRatingBreakdown(),
	]);

	const items: SegmentedTabItem<RatingFilter>[] = [
		{ key: "all", label: "Все", count: breakdown.count },
		...([5, 4, 3, 2, 1] as const).map((star) => ({
			key: String(star) as RatingFilter,
			label: `${star} ★`,
			count: breakdown.distribution[star],
		})),
	];

	return (
		// Общий layout витрины кладёт страницу в центрированную колонку с
		// отступом padding="l". Первому экрану он мешает: полоса обязана идти
		// во всю ширину окна и заезжать под шапку. Тот же приём, что на
		// главной, контактах, витрине каталога, в кабинете и в заказах.
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<JsonLd data={buildBreadcrumbSchema(BREADCRUMBS)} />

			<ReviewsHero
				titleLines={["Наши", "отзывы"]}
				breadcrumbs={BREADCRUMBS}
				aside={
					breakdown.count > 0 ? (
						<RatingSummary breakdown={breakdown} variant="stacked" />
					) : (
						<p className="max-w-[46ch] text-[0.9375rem] leading-[1.6] text-[var(--text-secondary)]">
							Отзывы появляются здесь после проверки модератором. Оставить свой
							можно на странице купленного товара.
						</p>
					)
				}
			/>

			<PageContainer className="pb-[4rem]">
				{/* Панель — прямой потомок колонки, без обёртки: её собственный
				    отступ задан в .rail, а обёртка ростом с панель отняла бы у
				    position: sticky ход (разбор — в Catalog.module.css). */}
				<div className="flex flex-col">
					<ReviewsRail
						paramName="rating"
						allKey="all"
						value={ratingKey}
						items={items}
						label="Отбор отзывов по оценке"
						totalDocs={feed.totalDocs}
						countLabel={pluralizeReviews(feed.totalDocs)}
					/>

					<div className="mt-[1.5rem] sm:mt-[2rem]">
						<PublicReviewsView
							key={ratingKey}
							initialReviews={feed.reviews}
							initialHasMore={feed.hasNextPage}
							totalDocs={feed.totalDocs}
							rating={rating}
						/>
					</div>
				</div>
			</PageContainer>
		</main>
	);
}
