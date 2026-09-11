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
	ProductBuyPanel,
	ProductGallery,
	ProductInformation,
	ProductPageHeader,
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
import { JsonLd } from "@/shared/components/JsonLd";
import { Reveal } from "@/shared/components/motion/Reveal";
import { PageContainer } from "@/shared/components/PageContainer";
import { buildBreadcrumbSchema } from "@/shared/lib/seo/schema";

interface Props {
	params: Promise<{ categorySlug: string; slug: string }>;
}

/**
 * За этим элементом следит липкая панель покупки: пока блок виден, панели
 * нет. Идентификатор живёт здесь, потому что связывает два соседних узла
 * одной разметки, а не принадлежит какому-то одному компоненту.
 */
const BUY_PANEL_ID = "product-buy-panel";

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
		<main className="w-full min-h-screen pb-[7rem]">
			<JsonLd data={jsonLd} />
			<JsonLd data={buildBreadcrumbSchema(breadcrumbItems)} />

			<PageContainer className="pt-6 sm:pt-[2rem]">
				<Breadcrumbs items={breadcrumbItems} />

				<div className="mt-5 sm:mt-6">
					<ProductPageHeader
						product={detailData}
						rating={{
							average: ratingBreakdown.average,
							count: ratingBreakdown.count,
						}}
					/>
				</div>

				{/*
				 * ПЕРВЫЙ ЭКРАН — разворот «галерея + покупка», и больше ничего.
				 *
				 * Раньше эта сетка тянулась на всю страницу: слева галерея и всё
				 * содержимое, справа липкий блок покупки. На широком экране это
				 * означало, что правая половина страницы ниже первого экрана
				 * пустует до самого подвала — блок покупки короткий, а под ним
				 * ничего нет. Здесь сетка заканчивается вместе с первым экраном,
				 * а описание, характеристики, отзывы и похожие товары идут под
				 * ней во всю меру. Доступность покупки на длинной странице
				 * держит липкая панель снизу (ProductStickyBar): она поднимается
				 * ровно тогда, когда блок покупки уходит из кадра.
				 *
				 * Порядок в разметке — галерея, затем покупка — верен и для
				 * мобильной одноколоночной раскладки: сначала смотрят товар,
				 * потом решают.
				 */}
				<div className="mt-[clamp(1.75rem,3vw,2.75rem)] grid grid-cols-1 items-start gap-x-10 gap-y-[2rem] lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-x-14 xl:grid-cols-[minmax(0,1fr)_25rem]">
					{/* Галерея появляется собственным входом, а не через <Reveal>:
					    у общего появления в показанном состоянии остаётся
					    clip-path: inset(0), то есть обрезка ровно по краю блока, —
					    а подсветка за кадром выходит за его границы и была бы
					    срезана. Вход при этом тот же по характеру (см.
					    .galleryEnter). */}
					<ProductGallery images={detailData.images} title={detailData.title} />

					<div
						id={BUY_PANEL_ID}
						className="lg:sticky lg:top-[calc(var(--sticky-header-height)+1.5rem)]"
					>
						<Reveal delay={340}>
							<ProductBuyPanel product={detailData} cardData={cardData} />
						</Reveal>
					</div>
				</div>

				<ProductInformation
					product={detailData}
					reviewsData={reviewsData}
					className="min-w-0"
				/>

				<ProductRelated products={relatedProducts} />
			</PageContainer>

			<ProductStickyBar
				product={detailData}
				cardData={cardData}
				watchId={BUY_PANEL_ID}
			/>
		</main>
	);
}
