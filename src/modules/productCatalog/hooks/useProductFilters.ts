"use client";

import debounce from "lodash/debounce";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import type {
	FilterState,
	SortField,
	SortOrder,
	SortState,
} from "../types/filters";

export function useProductFilters() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const filters: FilterState = useMemo(
		() => ({
			priceFrom: searchParams.get("priceFrom")
				? Number(searchParams.get("priceFrom"))
				: undefined,
			priceTo: searchParams.get("priceTo")
				? Number(searchParams.get("priceTo"))
				: undefined,
			status: (searchParams.get("status") as FilterState["status"]) || "all",
		}),
		[searchParams],
	);

	const sort: SortState = useMemo(
		() => ({
			field: (searchParams.get("sort") as SortField) || "createdAt",
			order: (searchParams.get("order") as SortOrder) || "desc",
		}),
		[searchParams],
	);

	const updateURL = useCallback(
		(newParams: Record<string, string | null>) => {
			const params = new URLSearchParams(searchParams.toString());
			Object.entries(newParams).forEach(([key, value]) => {
				if (value === null || value === "") {
					params.delete(key);
				} else {
					params.set(key, value);
				}
			});
			params.set("page", "1");
			router.replace(`${pathname}?${params.toString()}`, { scroll: false });
		},
		[searchParams, pathname, router],
	);

	// Ключ считается "переданным" даже если его значение undefined — это
	// единственный способ отличить "не трогать фильтр" от "очистить фильтр"
	// при точечном снятии одного чипа в ActiveFilterChips.
	const updateFilters = useCallback(
		(newFilters: Partial<FilterState>) => {
			const params: Record<string, string | null> = {};
			(Object.keys(newFilters) as (keyof FilterState)[]).forEach((key) => {
				const value = newFilters[key];
				if (key === "status") {
					params.status = value && value !== "all" ? String(value) : null;
				} else {
					params[key] =
						value === undefined || value === null ? null : String(value);
				}
			});
			updateURL(params);
		},
		[updateURL],
	);

	// Debounced версия — для перетаскивания слайдера цены, чтобы не долбить
	// router.replace на каждый пиксель драга.
	const debouncedUpdateFilters = useMemo(
		() => debounce(updateFilters, 350),
		[updateFilters],
	);
	useEffect(
		() => () => debouncedUpdateFilters.cancel(),
		[debouncedUpdateFilters],
	);

	const updateSort = useCallback(
		(field: SortField, order: SortOrder) => {
			updateURL({ sort: field, order });
		},
		[updateURL],
	);

	const resetFilters = useCallback(() => {
		updateURL({ priceFrom: null, priceTo: null, status: null });
	}, [updateURL]);

	const activeFiltersCount =
		(filters.priceFrom !== undefined || filters.priceTo !== undefined ? 1 : 0) +
		(filters.status !== "all" ? 1 : 0);

	return {
		filters,
		sort,
		updateFilters,
		debouncedUpdateFilters,
		updateSort,
		resetFilters,
		activeFiltersCount,
	};
}
