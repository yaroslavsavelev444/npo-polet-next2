export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import {
	buildProductJsonLd,
	buildProductMetadata,
	getProductHref,
	mapProductToCardData,
} from "@/modules/productCard";
import {
	getRelatedProducts,
	mapProductToDetailData,
	ProductDetailTabs,
	ProductGallery,
	ProductHeader,
	ProductRelated,
	ProductStickyBar,
} from "@/modules/productDetails";
import { getReviewsSectionData } from "@/modules/reviews/server";
import {
	getCachedProductById,
	getCachedProductByPreviousSlug,
	getCachedProductBySlug,
} from "@/payload/services/products.service";
import { getProductRatingBreakdown } from "@/payload/services/reviews.service";
import { baseURL } from "@/resources/content";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";

interface Props {
	params: Promise<{ categorySlug: string; slug: string }>;
}

/**
 * Резолвит /category/[categorySlug]/products/[slug] в конкретный товар,
 * уводя постоянным редиректом всё, что не является каноническим адресом.
 *
 * Раньше страница читала только id и полностью игнорировала categorySlug:
 * /category/<любой-мусор>/products/39 отдавал 200, а canonical строился из
 * URL-параметра и указывал сам на себя. Это давало неограниченное число
 * дублей одного товара, которые ничем не схлопывались.
 *
 * Теперь единственный источник правды — категория, к которой товар привязан
 * в Payload (см. getProductHref). Любой другой categorySlug — не
 * альтернативный адрес, а ошибка, и с него уходит редирект на канонический.
 *
 * Товар мог сменить slug и после того, как ЧПУ уже проиндексировано
 * (например, исправление опечатки в названии — см. hooks/trackPreviousSlug.ts).
 * Если прямой поиск по текущему slug ничего не нашёл, а сегмент не похож на
 * legacy-id, пробуем найти товар по истории его прежних slug — так старый
 * адрес продолжает 308-редиректить на актуальный, а не отдаёт 404.
 */
async function resolveProduct(categorySlug: string, slug: string) {
	// Числовой сегмент — legacy-URL старой схемы /products/[id], уже
	// проиндексированный. Его нельзя ни ломать, ни отдавать 200: находим товар
	// по id и уводим на ЧПУ, чтобы передать накопленный вес.
	const isLegacyId = /^\d+$/.test(slug);

	let product = isLegacyId
		? await getCachedProductById(slug)
		: await getCachedProductBySlug(slug);

	if (!product && !isLegacyId) {
		product = await getCachedProductByPreviousSlug(slug);
	}

	if (!product) notFound();

	const cardData = mapProductToCardData(product);
	const canonicalPath = getProductHref(cardData);
	const currentPath = `/category/${categorySlug}/products/${slug}`;

	// Товар без slug (не прошёл бэкофилл) по ЧПУ недостижим: для него
	// getProductHref вернёт тот же legacy-путь, что и запрошен, и редиректить
	// некуда — иначе цикл. Сравнение путей закрывает этот случай само.
	if (canonicalPath !== currentPath) {
		permanentRedirect(canonicalPath);
	}

	return { product, cardData };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { categorySlug, slug } = await params;
	const { product, cardData } = await resolveProduct(categorySlug, slug);

	return buildProductMetadata(cardData, {
		metaTitle: product.seo?.metaTitle,
		metaDescription: product.seo?.metaDescription,
		canonicalUrl: `${baseURL}${getProductHref(cardData)}`,
	});
}

export default async function ProductDetailPage({ params }: Props) {
	const { categorySlug, slug } = await params;
	const { product, cardData } = await resolveProduct(categorySlug, slug);

	const detailData = mapProductToDetailData(product);
	const upsellIds = detailData.upsellProducts.map((p) => p.id);

	const user = await getCurrentUser();

	const [ratingBreakdown, reviewsData, relatedProducts] = await Promise.all([
		getProductRatingBreakdown(detailData.id),
		getReviewsSectionData(detailData.id, detailData.title, user?.id ?? null),
		detailData.category
			? getRelatedProducts(detailData.category.id, detailData.id, upsellIds)
			: Promise.resolve([]),
	]);

	// Рейтинг из отзывов уходит и в карточку для JSON-LD (aggregateRating), и в
	// шапку — единый источник агрегата на всю страницу.
	cardData.rating = ratingBreakdown.average;
	cardData.reviewsCount = ratingBreakdown.count;

	const canonicalUrl = `${baseURL}${getProductHref(cardData)}`;
	const jsonLd = buildProductJsonLd(cardData, canonicalUrl);

	const breadcrumbItems = [
		{ title: "Главная", href: "/" },
		{ title: "Категории", href: "/category" },
		...(detailData.category
			? [
					{
						title: detailData.category.title,
						href: `/category/${detailData.category.slug}`,
					},
				]
			: []),
		{ title: detailData.title },
	];

	return (
		<main className="min-h-screen pb-24 lg:pb-16">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
			/>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(buildBreadcrumbSchema(breadcrumbItems)),
				}}
			/>

			<div className="container mx-auto px-4 py-6 sm:py-8">
				<Breadcrumbs items={breadcrumbItems} variant="white" />

				{/* Верх: галерея + блок покупки. На десктопе блок покупки липкий.
				    Ширину верхнего блока ограничиваем (~840px), а колонку покупки
				    фиксируем в 380px — так квадратный кадр галереи держится в пределах
				    ~420px и не раздувается на весь первый экран на широких мониторах. */}
				<div className="mt-6 grid grid-cols-1 gap-8 lg:max-w-[840px] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
					<ProductGallery images={detailData.images} title={detailData.title} />

					<div className="lg:sticky lg:top-24 lg:self-start">
						<ProductHeader
							product={detailData}
							cardData={cardData}
							rating={{
								average: ratingBreakdown.average,
								count: ratingBreakdown.count,
							}}
						/>
					</div>
				</div>

				{/* Описание — отдельной секцией, чтобы не оттеснять кнопку покупки вниз */}
				{detailData.description && (
					<section className="mt-12 max-w-3xl">
						<h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
							Описание
						</h2>
						<p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
							{detailData.description}
						</p>
					</section>
				)}

				<div className="mt-12">
					<ProductDetailTabs product={detailData} reviewsData={reviewsData} />
				</div>

				<div className="mt-16">
					<ProductRelated products={relatedProducts} />
				</div>
			</div>

			<ProductStickyBar product={detailData} cardData={cardData} />
		</main>
	);
}
