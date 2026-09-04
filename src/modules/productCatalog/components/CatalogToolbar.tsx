"use client";

import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { formatPrice } from "@/modules/productCard";
import { Badge, FilterChip } from "@/UI";
import { cn } from "@/utils/cn";
import { useProductFilters } from "../hooks/useProductFilters";
import { pluralizeProducts, statusLabel } from "../lib/catalogOptions";
import type { PriceBounds } from "../types/filters";
import { SortMenu } from "./SortMenu";

interface CatalogToolbarProps {
	totalDocs: number;
	priceBounds: PriceBounds;
	onOpenFilters: () => void;
	onOpenSort: () => void;
}

const sheetButtonClass =
	"flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--surface)] px-3 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-light)]";

/**
 * Панель выдачи: сводка слева, управление справа.
 *
 * Панель липкая и «приклеена» к шапке верхней волосяной линией — именно она
 * связывает верх страницы с сеткой ниже. Пока панель просто стояла в потоке,
 * между заголовком и товарами зияла полоса пустоты, а на длинном каталоге
 * сортировка и фильтры уезжали за экран и до них приходилось скроллить вверх.
 * Особенно это било по мобильному, где фильтры доступны только отсюда.
 *
 * Липкое смещение считается от --sticky-header-height — той же переменной, по
 * которой позиционируется шапка сайта, поэтому панель садится ровно под неё
 * и на мобильном (шапка ниже), и на десктопе.
 *
 * Панель занимает ровно ширину контента и не «вылезает» за неё отрицательными
 * полями: полоса между краем контента и краем экрана принадлежит внешним
 * отступам макета, товары в неё не заходят, и размывать там нечего. Попытка
 * растянуть панель туда давала горизонтальную прокрутку на планшете —
 * собственные поля контейнера шире внешнего отступа макета.
 */
export function CatalogToolbar({
	totalDocs,
	priceBounds,
	onOpenFilters,
	onOpenSort,
}: CatalogToolbarProps) {
	const { filters, updateFilters, resetFilters, activeFiltersCount } =
		useProductFilters();

	const hasPriceFilter =
		filters.priceFrom !== undefined || filters.priceTo !== undefined;
	const hasStatusFilter = filters.status !== "all";
	const hasPriceRange =
		totalDocs > 0 && priceBounds.max > 0 && priceBounds.max > priceBounds.min;

	return (
		<div
			className={cn(
				"catalog-toolbar sticky z-30 flex flex-col gap-2.5 py-3",
				"border-t border-[var(--hairline)] backdrop-blur-xl backdrop-saturate-150",
			)}
			style={{ top: "var(--sticky-header-height)" }}
		>
			<div className="flex items-center justify-between gap-3">
				<p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-[var(--text-muted)]">
					<span className="whitespace-nowrap">
						<span className="font-semibold tabular-nums text-[var(--text-primary)]">
							{totalDocs}
						</span>{" "}
						{pluralizeProducts(totalDocs)}
					</span>

					{hasPriceRange && (
						<span className="hidden whitespace-nowrap tabular-nums sm:inline">
							<span aria-hidden="true" className="mr-[0.5rem] text-[var(--border-light)]">
								·
							</span>
							{formatPrice(priceBounds.min)} — {formatPrice(priceBounds.max)}
						</span>
					)}
				</p>

				<div className="hidden shrink-0 lg:block">
					<SortMenu />
				</div>

				<div className="flex shrink-0 items-center gap-2 lg:hidden">
					<button
						type="button"
						onClick={onOpenFilters}
						className={sheetButtonClass}
					>
						<SlidersHorizontal size={14} aria-hidden />
						Фильтры
						{activeFiltersCount > 0 && (
							<Badge variant="primary" size="sm">
								{activeFiltersCount}
							</Badge>
						)}
					</button>
					<button type="button" onClick={onOpenSort} className={sheetButtonClass}>
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
						className="rounded-sm text-xs font-medium text-[var(--text-muted)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:underline"
					>
						Сбросить всё
					</button>
				</div>
			)}
		</div>
	);
}

export default CatalogToolbar;
