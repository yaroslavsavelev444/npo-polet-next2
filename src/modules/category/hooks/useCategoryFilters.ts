"use client";

import debounce from "lodash/debounce";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import type {
	CategoryFilters,
	CategorySortField,
	CategorySortOrder,
} from "../types/filters";

export function useCategoryFilters() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const filters: CategoryFilters = useMemo(
		() => ({
			q: searchParams.get("q") ?? undefined,
			field: (searchParams.get("sort") as CategorySortField) || "order",
			order: (searchParams.get("order") as CategorySortOrder) || "asc",
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
			const query = params.toString();
			router.replace(query ? `${pathname}?${query}` : pathname, {
				scroll: false,
			});
		},
		[searchParams, pathname, router],
	);

	const updateSearch = useCallback(
		(q: string) => updateURL({ q: q.trim() || null }),
		[updateURL],
	);

	// Debounced версия — чтобы не долбить router.replace на каждое нажатие клавиши.
	const debouncedUpdateSearch = useMemo(
		() => debounce(updateSearch, 350),
		[updateSearch],
	);
	useEffect(
		() => () => debouncedUpdateSearch.cancel(),
		[debouncedUpdateSearch],
	);

	const updateSort = useCallback(
		(field: CategorySortField, order: CategorySortOrder) => {
			const isDefault = field === "order" && order === "asc";
			updateURL({
				sort: isDefault ? null : field,
				order: isDefault ? null : order,
			});
		},
		[updateURL],
	);

	const clearSearch = useCallback(() => {
		debouncedUpdateSearch.cancel();
		updateSearch("");
	}, [debouncedUpdateSearch, updateSearch]);

	const resetFilters = useCallback(() => {
		debouncedUpdateSearch.cancel();
		updateURL({ q: null, sort: null, order: null });
	}, [debouncedUpdateSearch, updateURL]);

	const activeFiltersCount =
		(filters.q ? 1 : 0) +
		(filters.field !== "order" || filters.order !== "asc" ? 1 : 0);

	return {
		filters,
		updateSearch,
		debouncedUpdateSearch,
		clearSearch,
		updateSort,
		resetFilters,
		activeFiltersCount,
	};
}
