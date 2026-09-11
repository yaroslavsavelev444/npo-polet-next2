export const dynamic = "force-dynamic";
export const revalidate = 0;

// ВАЖНО: не добавлять сюда loading.tsx на уровне сегмента.
//
// Файл loading.tsx в app/(frontend)/category/ оборачивает в Suspense не только
// эту страницу, но и ВСЕ вложенные маршруты (/category/[categorySlug] и
// карточки товаров). Ответ при этом начинает стримиться, HTTP-статус
// фиксируется как 200 ещё до того, как страница успевает вызвать notFound()
// или permanentRedirect(). Последствия были видны на проде:
//   • /category/<несуществующая> отдавала 200 вместо 404 (soft-404);
//   • /category/<чужая>/products/<slug> отдавала 200 + <meta http-equiv
//     ="refresh"> вместо честного 308 — то есть дубль оставался
//     индексируемым (см. permanentRedirect.md, раздел про streaming).
// Скелетон ниже живёт ВНУТРИ самой страницы (Suspense вокруг выдачи), а сама
// страница ни notFound(), ни редиректов не вызывает — на статус ответа он не
// влияет.

import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoryCatalogHero } from "@/modules/category/components/CategoryCatalogHero";
import { CategoryCatalogSkeleton } from "@/modules/category/components/CategoryCatalogSkeleton";
import { CategoryCatalogView } from "@/modules/category/components/CategoryCatalogView";
import { mapCategoryToCardData } from "@/modules/category/lib/adapter";
import { parseCategorySearchParams } from "@/modules/category/lib/parseFilters";
import type { CategoryFilters } from "@/modules/category/types/filters";
import { getCachedCategories } from "@/payload/services/categories.service";
import { getCachedCategoryProductCounts } from "@/payload/services/products.service";
import { baseURL } from "@/resources/content";
import { JsonLd } from "@/shared/components/JsonLd";
import { PageContainer } from "@/shared/components/PageContainer";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";

const PAGE_PATH = "/category";
const PAGE_URL = `${baseURL}${PAGE_PATH}`;

// Заголовок разбит на строки вручную — почему именно так, см. комментарий в
// CategoryCatalogHero. Меняя его, там же придётся пересчитать границы кегля.
const HERO_TITLE_LINES = ["Каталог", "продукции"];
const HERO_LEAD =
	"Средства противодействия беспилотникам: стационарные комплексы, носимые и ручные изделия, антидроновая защита периметра. Выберите раздел или найдите нужное по названию.";

const PAGE_DESCRIPTION =
	"Разделы каталога НПО «Полёт»: комплексы радиоэлектронного подавления, ручные и стационарные средства противодействия БПЛА.";

export const metadata: Metadata = {
	title: "Каталог продукции",
	description: PAGE_DESCRIPTION,
	alternates: { canonical: PAGE_URL },
	openGraph: {
		title: "Каталог продукции",
		description: PAGE_DESCRIPTION,
		url: PAGE_URL,
		type: "website",
	},
};

const BREADCRUMB_ITEMS = [
	{ title: "Главная", href: "/" },
	{ title: "Каталог", href: PAGE_PATH },
];

interface CategoriesPageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Витрина каталога — верхний ярус того же интерфейса, что и выдача товаров
 * внутри раздела.
 *
 * Три яруса сверху вниз, чем ниже — тем конкретнее:
 *
 *   1. первый экран — что это за каталог;
 *   2. липкая панель — сколько здесь разделов и как их отобрать;
 *   3. сетка — сами разделы.
 *
 * Порядок и материалы совпадают со страницей раздела намеренно: переход
 * «каталог → раздел» не должен читаться как переход на другой сайт.
 *
 * Первый экран не ждёт базу: он полностью статичен и уходит в ответ сразу, а
 * выдача подставляется по готовности (Suspense вокруг CategoryCatalogContent).
 * Разница видна на холодном кэше — вместо пустого экрана посетитель сразу
 * получает заголовок и ориентир.
 */
export default async function CategoriesPage({
	searchParams,
}: CategoriesPageProps) {
	const rawSearchParams = await searchParams;
	const filters = parseCategorySearchParams(rawSearchParams);

	return (
		// Общий layout витрины кладёт страницу в центрированную колонку с
		// отступом padding="l". Первому экрану он мешает: полоса обязана идти
		// во всю ширину окна и заезжать под шапку. .full-bleed возвращает
		// полную ширину, отрицательные поля снимают вертикальный отступ —
		// иначе над первым экраном остаётся полоса фона. Тот же приём, что на
		// главной и на контактах.
		<main
			className="full-bleed min-h-screen"
			style={{
				marginTop: "calc(-1 * var(--responsive-space-l))",
				marginBottom: "calc(-1 * var(--responsive-space-l))",
			}}
		>
			<JsonLd data={buildBreadcrumbSchema(BREADCRUMB_ITEMS)} />

			<CategoryCatalogHero
				titleLines={HERO_TITLE_LINES}
				lead={HERO_LEAD}
				breadcrumbs={BREADCRUMB_ITEMS}
			/>

			<PageContainer className="pb-[5rem]">
				<Suspense fallback={<CategoryCatalogSkeleton />}>
					<CategoryCatalogContent filters={filters} />
				</Suspense>
			</PageContainer>
		</main>
	);
}

/**
 * Данные витрины.
 *
 * Два независимых запроса идут одним Promise.all — зависимости между ними
 * нет, а последовательно они складывались бы в сумму задержек. Оба
 * кэшируются с тегами и сбрасываются хуками Payload.
 *
 * Отбор и сортировка применяются уже в клиентском компоненте — в том числе
 * при серверной отрисовке, поэтому в HTML попадает готовая выдача (для
 * поисковика и для случая, когда JS не выполнился), а дальше уточнение
 * запроса идёт мгновенно и без обращения к серверу. Разбор — в
 * useCategoryFilters.
 */
async function CategoryCatalogContent({
	filters,
}: {
	filters: CategoryFilters;
}) {
	const [{ docs: allCategories }, productCounts] = await Promise.all([
		getCachedCategories({
			isActive: true,
			sort: "order",
			limit: 200,
			depth: 1,
		}),
		getCachedCategoryProductCounts(),
	]);

	const categories = allCategories.map((category) =>
		mapCategoryToCardData(category, productCounts[String(category.id)] ?? 0),
	);

	const totalProducts = categories.reduce(
		(sum, category) => sum + category.productCount,
		0,
	);

	return (
		<CategoryCatalogView
			categories={categories}
			initialFilters={filters}
			totalProducts={totalProducts}
		/>
	);
}
