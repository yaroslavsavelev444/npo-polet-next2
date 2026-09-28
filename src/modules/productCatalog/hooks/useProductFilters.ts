"use client";

import debounce from "lodash/debounce";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import {
	countFacetSelection,
	EMPTY_FACET_SELECTION,
	readFacetSelection,
	writeFacetSelection,
} from "../lib/facetParams";
import type {
	FacetSelection,
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

	// Фасеты из адреса. Проверены только синтаксически — неизвестное разделу
	// сервер отбросит сам (sanitizeFacetSelection).
	const facets: FacetSelection = useMemo(
		() => readFacetSelection(searchParams),
		[searchParams],
	);

	const updateURL = useCallback(
		(newParams: Record<string, string | null>, nextFacets?: FacetSelection) => {
			const params = new URLSearchParams(searchParams.toString());
			Object.entries(newParams).forEach(([key, value]) => {
				if (value === null || value === "") {
					params.delete(key);
				} else {
					params.set(key, value);
				}
			});
			// Фасеты всегда пишутся в каноническом порядке: один выбор — один
			// адрес, независимо от того, в какой последовательности отмечали.
			if (nextFacets) writeFacetSelection(params, nextFacets);
			params.set("page", "1");
			router.replace(`${pathname}?${params.toString()}`, { scroll: false });
		},
		[searchParams, pathname, router],
	);

	const updateFacets = useCallback(
		(mutate: (current: FacetSelection) => FacetSelection) => {
			updateURL({}, mutate(facets));
		},
		[updateURL, facets],
	);

	const toggleBrand = useCallback(
		(brand: string) =>
			updateFacets((current) => ({
				...current,
				brands: current.brands.includes(brand)
					? current.brands.filter((b) => b !== brand)
					: [...current.brands, brand],
			})),
		[updateFacets],
	);

	const setDiscount = useCallback(
		(discount: boolean) =>
			updateFacets((current) => ({ ...current, discount })),
		[updateFacets],
	);

	const toggleSpecValue = useCallback(
		(facetKey: string, value: string) =>
			updateFacets((current) => {
				const values = current.specs[facetKey]?.values ?? [];
				const next = values.includes(value)
					? values.filter((v) => v !== value)
					: [...values, value];
				const specs = { ...current.specs };
				if (next.length > 0) specs[facetKey] = { values: next };
				else delete specs[facetKey];
				return { ...current, specs };
			}),
		[updateFacets],
	);

	const setSpecRange = useCallback(
		(facetKey: string, min: number | undefined, max: number | undefined) =>
			updateFacets((current) => {
				const specs = { ...current.specs };
				if (min !== undefined || max !== undefined)
					specs[facetKey] = { min, max };
				else delete specs[facetKey];
				return { ...current, specs };
			}),
		[updateFacets],
	);

	const clearSpec = useCallback(
		(facetKey: string) =>
			updateFacets((current) => {
				const specs = { ...current.specs };
				delete specs[facetKey];
				return { ...current, specs };
			}),
		[updateFacets],
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

	// Debounced версии — для перетаскивания слайдеров (цена, числовые
	// характеристики), чтобы не долбить router.replace на каждый пиксель драга.
	const debouncedUpdateFilters = useMemo(
		() => debounce(updateFilters, 350),
		[updateFilters],
	);
	useEffect(
		() => () => debouncedUpdateFilters.cancel(),
		[debouncedUpdateFilters],
	);
	const debouncedSetSpecRange = useMemo(
		() => debounce(setSpecRange, 350),
		[setSpecRange],
	);
	useEffect(
		() => () => debouncedSetSpecRange.cancel(),
		[debouncedSetSpecRange],
	);

	const updateSort = useCallback(
		(field: SortField, order: SortOrder) => {
			updateURL({ sort: field, order });
		},
		[updateURL],
	);

	const resetFilters = useCallback(() => {
		updateURL(
			{ priceFrom: null, priceTo: null, status: null },
			EMPTY_FACET_SELECTION,
		);
	}, [updateURL]);

	const activeFiltersCount =
		(filters.priceFrom !== undefined || filters.priceTo !== undefined ? 1 : 0) +
		(filters.status !== "all" ? 1 : 0) +
		countFacetSelection(facets);

	return {
		filters,
		facets,
		sort,
		updateFilters,
		debouncedUpdateFilters,
		updateSort,
		toggleBrand,
		setDiscount,
		toggleSpecValue,
		setSpecRange,
		debouncedSetSpecRange,
		clearSpec,
		resetFilters,
		activeFiltersCount,
	};
}
