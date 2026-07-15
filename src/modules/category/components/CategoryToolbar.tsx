"use client";

import { ArrowUpDown, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Dropdown, FilterChip, Input } from "@/UI";
import { useCategoryFilters } from "../hooks/useCategoryFilters";
import {
	CATEGORY_SORT_OPTIONS,
	findCategorySortOption,
	pluralizeCategories,
} from "../lib/categoryOptions";

interface CategoryToolbarProps {
	totalCount: number;
	filteredCount: number;
}

export function CategoryToolbar({
	totalCount,
	filteredCount,
}: CategoryToolbarProps) {
	const {
		filters,
		debouncedUpdateSearch,
		clearSearch,
		updateSort,
		resetFilters,
		activeFiltersCount,
	} = useCategoryFilters();

	const [searchValue, setSearchValue] = useState(filters.q ?? "");

	// Подхватываем внешние изменения URL (сброс фильтров, навигация назад/вперёд).
	useEffect(() => {
		setSearchValue(filters.q ?? "");
	}, [filters.q]);

	const currentSort = findCategorySortOption(filters.field, filters.order);
	const hasSearch = Boolean(filters.q);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<Input
					value={searchValue}
					onChange={(e) => {
						setSearchValue(e.target.value);
						debouncedUpdateSearch(e.target.value);
					}}
					placeholder="Поиск по категориям"
					aria-label="Поиск по категориям"
					leftIcon={<Search size={16} aria-hidden />}
					rightIcon={
						searchValue ? (
							<button
								type="button"
								onClick={() => {
									setSearchValue("");
									clearSearch();
								}}
								aria-label="Очистить поиск"
								className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
							>
								<X size={13} aria-hidden />
							</button>
						) : undefined
					}
					wrapperClassName="sm:flex-1"
				/>

				<Dropdown
					selectedKey={currentSort.value}
					items={CATEGORY_SORT_OPTIONS.map((option) => ({
						key: option.value,
						label: option.label,
					}))}
					onSelect={(key) => {
						const option = CATEGORY_SORT_OPTIONS.find((o) => o.value === key);
						if (option) updateSort(option.field, option.order);
					}}
					placement="bottom-end"
					className="sm:self-stretch"
				>
					<button
						type="button"
						className="flex h-full w-full items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3.5 !py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-light)] sm:w-auto"
					>
						<ArrowUpDown
							size={14}
							className="text-[var(--text-muted)]"
							aria-hidden
						/>
						{currentSort.label}
						<ChevronDown
							size={14}
							className="text-[var(--text-muted)]"
							aria-hidden
						/>
					</button>
				</Dropdown>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<p className="text-sm text-[var(--text-secondary)]">
					{hasSearch ? (
						<>
							<span className="font-semibold text-[var(--text-primary)]">
								{filteredCount}
							</span>{" "}
							{pluralizeCategories(filteredCount)} из {totalCount}
						</>
					) : (
						<>
							<span className="font-semibold text-[var(--text-primary)]">
								{totalCount}
							</span>{" "}
							{pluralizeCategories(totalCount)}
						</>
					)}
				</p>

				{activeFiltersCount > 0 && (
					<div className="flex flex-wrap items-center gap-2 animate-[fade-in_0.2s_ease-out]">
						{hasSearch && (
							<FilterChip label={`«${filters.q}»`} onRemove={clearSearch} />
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
		</div>
	);
}

export default CategoryToolbar;
