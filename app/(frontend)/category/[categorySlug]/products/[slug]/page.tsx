export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs/Breadcrumbs";
import {
	buildProductJsonLd,
	buildProductMetadata,
	getProductHref,
	mapProductToCardData,
} from "@/modules/productCard";
import {
	getRelatedProducts,
	mapProductToDetailData,
	ProductCharacteristicsPreview,
	ProductDetailTabs,
	ProductGallery,
	ProductHeader,
	ProductRelated,
} from "@/modules/productDetails";
import {
	getCachedProductById,
	getCachedProductByPreviousSlug,
	getCachedProductBySlug,
} from "@/payload/services/products.service";
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

	const relatedProducts = detailData.category
		? await getRelatedProducts(detailData.category.id, detailData.id, upsellIds)
		: [];

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
		<main className="min-h-screen pb-16">
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

			<div className="container mx-auto px-4 py-8">
				<Breadcrumbs items={breadcrumbItems} variant="white" />

				<div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2">
					<ProductGallery images={detailData.images} title={detailData.title} />

					<div className="flex flex-col gap-8">
						<ProductHeader product={detailData} cardData={cardData} />
						<ProductCharacteristicsPreview
							specifications={detailData.specifications}
						/>
					</div>
				</div>

				<div className="mt-10">
					<ProductDetailTabs product={detailData} />
				</div>

				<div className="mt-14">
					<ProductRelated products={relatedProducts} />
				</div>
			</div>
		</main>
	);
}
