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
import { DesktopFiltersSidebar } from "./DesktopFiltersSidebar";
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

			{/* Панель липкая, поэтому отступ до неё принадлежит шапке, а отступ
			    после — сетке: расстояния не зависят от того, есть ли у категории
			    описание и активны ли фильтры. */}
			<div className="mt-6 sm:mt-[2rem]">
				<CatalogToolbar
					totalDocs={initialPage.totalDocs}
					priceBounds={priceBounds}
					onOpenFilters={() => setMobileFiltersOpen(true)}
					onOpenSort={() => setMobileSortOpen(true)}
				/>
			</div>

			{/* Без lg:items-start: колонки тянутся на всю высоту ряда, и вертикальная
			    линия у <aside> идёт вдоль всего каталога, а не обрывается там, где
			    кончились фильтры. Липкость самих фильтров это не ломает — она на
			    вложенном блоке. */}
			<div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-8">
				{/* Разделительная линия висит на самом <aside>, а не на липком
				    блоке внутри: так она идёт колонтитулом во всю высоту каталога,
				    а не обрывается там, где кончились фильтры. */}
				<aside className="hidden shrink-0 border-r border-[var(--hairline)] pr-6 lg:block lg:w-[17rem] xl:w-[19rem]">
					{/* Смещение больше, чем у панели выдачи: иначе верх фильтров
					    оказывался под ней. */}
					<div className="sticky top-[calc(var(--sticky-header-height)+5.5rem)]">
						<DesktopFiltersSidebar priceBounds={priceBounds} />
					</div>
				</aside>

				<div className="min-w-0 flex-1">
					<CatalogProductGrid
						categoryId={categoryId}
						filters={filters}
						initialPage={initialPage}
					/>
				</div>
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
