"use client";

import { useState } from "react";
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
	filters: CatalogFilters;
	priceBounds: PriceBounds;
	initialPage: ProductsPageResponse;
}

export function ProductCatalogLayout({
	category,
	categoryId,
	filters,
	priceBounds,
	initialPage,
}: ProductCatalogLayoutProps) {
	const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
	const [mobileSortOpen, setMobileSortOpen] = useState(false);

	return (
		<div className="flex flex-col gap-8">
			<header className="flex flex-col gap-2">
				<h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
					{category.name}
				</h1>
				{category.description && (
					<p className="max-w-2xl text-base text-[var(--text-secondary)]">
						{category.description}
					</p>
				)}
			</header>

			<CatalogToolbar
				totalDocs={initialPage.totalDocs}
				onOpenFilters={() => setMobileFiltersOpen(true)}
				onOpenSort={() => setMobileSortOpen(true)}
			/>

			<div className="flex flex-col gap-8 lg:flex-row lg:items-start">
				<aside className="hidden shrink-0 lg:block lg:w-72">
					<div className="sticky top-[calc(var(--sticky-header-height)+1.5rem)]">
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
