"use client";

import { useState } from "react";
import type { BreadcrumbItem } from "@/components/Breadcrumbs/Breadcrumbs";
import { CategoryPageHeader } from "@/modules/category/components/CategoryPageHeader";
import type {
	CatalogFilters,
	PriceBounds,
	ProductsPageResponse,
} from "../types/filters";
import { CatalogProductGrid } from "./CatalogProductGrid";
import { CatalogToolbar } from "./CatalogToolbar";
import { MobileFiltersSheet } from "./MobileFiltersSheet";
import { MobileSortSheet } from "./MobileSortSheet";

interface CategorySummary {
	name: string;
	description?: string | null;
}

interface ProductCatalogLayoutProps {
	category: CategorySummary;
	categoryId: string;
	breadcrumbs: BreadcrumbItem[];
	filters: CatalogFilters;
	priceBounds: PriceBounds;
	initialPage: ProductsPageResponse;
}

/**
 * Страница каталога в трёх ярусах: чем ниже, тем конкретнее.
 *
 *   1. шапка — что это за раздел;
 *   2. липкая панель — сколько тут позиций и как их отобрать;
 *   3. сетка — сами товары.
 *
 * Боковой колонки фильтров больше нет: под два фильтра она занимала четверть
 * ширины и отбирала у сетки колонку товаров — разбор в шапке CatalogToolbar.
 * Сетка идёт во всю ширину контента, и число колонок ей задают контейнерные
 * запросы (см. productGrid), а не вьюпорт.
 *
 * Отступ до панели принадлежит шапке, отступ после — сетке: панель липкая, и
 * расстояния не должны зависеть ни от наличия описания у категории, ни от
 * того, активны ли фильтры.
 */
export function ProductCatalogLayout({
	category,
	categoryId,
	breadcrumbs,
	filters,
	priceBounds,
	initialPage,
}: ProductCatalogLayoutProps) {
	const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
	const [mobileSortOpen, setMobileSortOpen] = useState(false);

	return (
		<div className="flex flex-col">
			<CategoryPageHeader
				name={category.name}
				description={category.description}
				breadcrumbs={breadcrumbs}
			/>

			<div className="mt-[2rem] sm:mt-[3rem]">
				<CatalogToolbar
					totalDocs={initialPage.totalDocs}
					priceBounds={priceBounds}
					onOpenFilters={() => setMobileFiltersOpen(true)}
					onOpenSort={() => setMobileSortOpen(true)}
				/>
			</div>

			<div className="mt-[2rem] sm:mt-[2.5rem]">
				<CatalogProductGrid
					categoryId={categoryId}
					filters={filters}
					initialPage={initialPage}
				/>
			</div>

			<MobileFiltersSheet
				open={mobileFiltersOpen}
				onClose={() => setMobileFiltersOpen(false)}
				priceBounds={priceBounds}
				resultCount={initialPage.totalDocs}
			/>
			<MobileSortSheet
				open={mobileSortOpen}
				onClose={() => setMobileSortOpen(false)}
			/>
		</div>
	);
}

export default ProductCatalogLayout;
