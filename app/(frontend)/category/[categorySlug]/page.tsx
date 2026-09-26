// app/(frontend)/category/[categorySlug]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getImageData } from "@/modules/category/lib/media";
import type { ProductQuery } from "@/modules/productCard/types/query";
import { ProductCatalogLayout } from "@/modules/productCatalog/components/ProductCatalogLayout";
import { parseCatalogSearchParams } from "@/modules/productCatalog/lib/parseFilters";
import { getCachedCategoryBySlug } from "@/payload/services/categories.service";
import {
	getCachedCategoryPriceBounds,
	getCachedCategoryProductCounts,
	getCatalogData,
} from "@/payload/services/products.service";
import { baseURL } from "@/resources/content";
import { PageContainer } from "@/shared/components/PageContainer";

interface Props {
	params: Promise<{ categorySlug: string }>;
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { categorySlug } = await params;
	const [category, productCounts] = await Promise.all([
		getCachedCategoryBySlug(categorySlug),
		getCachedCategoryProductCounts(),
	]);

	if (!category) return { title: "Категория не найдена" };

	// Раздел без видимых товаров отдаёт пустую выдачу — для Google это soft
	// 404, для Яндекса малоценная страница. Закрываем его от индексации (ссылки
	// остаются рабочими) и не кладём в sitemap (см. sitemap.ts). Считается по
	// всему разделу, а не по текущим фильтрам: пустая выдача из-за фильтра
	// индексацию не меняет — такие адреса и так схлопываются canonical-ом.
	const isEmpty = (productCounts[String(category.id)] ?? 0) === 0;

	return {
		title: category.metaTitle || category.name,
		robots: isEmpty ? { index: false, follow: true } : undefined,
		description: category.metaDescription || category.description,
		alternates: { canonical: `${baseURL}/category/${categorySlug}` },
		openGraph: {
			title: category.metaTitle || category.name,
			description:
				category.metaDescription || category.description || undefined,
			url: `${baseURL}/category/${categorySlug}`,
			type: "website",
			images: getImageData(category.image)?.url
				? [{ url: getImageData(category.image)!.url }]
				: undefined,
		},
	};
}

export default async function CategoryPage({ params, searchParams }: Props) {
	const { categorySlug } = await params;
	const rawSearchParams = await searchParams;

	// Получаем категорию
	const category = await getCachedCategoryBySlug(categorySlug);
	if (!category) notFound();

	// Парсим и валидируем searchParams
	const filters = parseCatalogSearchParams(rawSearchParams);
	const categoryId = category.id.toString();

	const query: ProductQuery = {
		categoryId,
		isVisible: true,
		priceFrom: filters.priceFrom,
		priceTo: filters.priceTo,
		status: filters.status === "all" ? undefined : filters.status,
		sort: filters.field,
		order: filters.order,
		limit: 24,
		page: filters.page,
	};

	const [catalogResult, priceBounds] = await Promise.all([
		getCatalogData(query),
		getCachedCategoryPriceBounds(categoryId),
	]);

	const breadcrumbItems = [
		{ title: "Главная", href: "/" },
		{ title: "Каталог", href: "/category" },
		{ title: category.name, href: `/category/${categorySlug}` },
	];

	return (
		<main className="w-full min-h-screen pb-[4rem]">
			<PageContainer className="pb-6 pt-6 sm:pt-[2rem]">
				<ProductCatalogLayout
					category={category}
					categoryId={categoryId}
					breadcrumbs={breadcrumbItems}
					filters={filters}
					priceBounds={priceBounds}
					initialPage={{
						...catalogResult,
						nextCursor: catalogResult.pagination.hasNextPage
							? filters.page + 1
							: null,
					}}
				/>
			</PageContainer>
		</main>
	);
}
