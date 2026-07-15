"use client";

import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { formatPrice } from "@/modules/productCard";
import { Badge, FilterChip } from "@/UI";
import { useProductFilters } from "../hooks/useProductFilters";
import { pluralizeProducts, statusLabel } from "../lib/catalogOptions";
import { SortMenu } from "./SortMenu";

interface CatalogToolbarProps {
	totalDocs: number;
	onOpenFilters: () => void;
	onOpenSort: () => void;
}

export function CatalogToolbar({
	totalDocs,
	onOpenFilters,
	onOpenSort,
}: CatalogToolbarProps) {
	const { filters, updateFilters, resetFilters, activeFiltersCount } =
		useProductFilters();

	const hasPriceFilter =
		filters.priceFrom !== undefined || filters.priceTo !== undefined;
	const hasStatusFilter = filters.status !== "all";

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm text-[var(--text-secondary)]">
					<span className="font-semibold text-[var(--text-primary)]">
						{totalDocs}
					</span>{" "}
					{pluralizeProducts(totalDocs)}
				</p>

				<div className="hidden lg:block">
					<SortMenu />
				</div>

				<div className="flex items-center gap-2 lg:hidden">
					<button
						type="button"
						onClick={onOpenFilters}
						className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 !py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-light)]"
					>
						<SlidersHorizontal size={14} aria-hidden />
						Фильтры
						{activeFiltersCount > 0 && (
							<Badge variant="primary" size="sm">
								{activeFiltersCount}
							</Badge>
						)}
					</button>
					<button
						type="button"
						onClick={onOpenSort}
						className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 !py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-light)]"
					>
						<ArrowUpDown size={14} aria-hidden />
						Сортировка
					</button>
				</div>
			</div>

			{activeFiltersCount > 0 && (
				<div className="flex flex-wrap items-center gap-2 animate-[fade-in_0.2s_ease-out]">
					{hasPriceFilter && (
						<FilterChip
							label={`${filters.priceFrom !== undefined ? formatPrice(filters.priceFrom) : "от 0"} — ${
								filters.priceTo !== undefined
									? formatPrice(filters.priceTo)
									: "∞"
							}`}
							onRemove={() =>
								updateFilters({ priceFrom: undefined, priceTo: undefined })
							}
						/>
					)}
					{hasStatusFilter && (
						<FilterChip
							label={statusLabel(filters.status)}
							onRemove={() => updateFilters({ status: "all" })}
						/>
					)}
					<button
						type="button"
						onClick={resetFilters}
						className="text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:underline underline-offset-2"
					>
						Сбросить всё
					</button>
				</div>
			)}
		</div>
	);
}

export default CatalogToolbar;
