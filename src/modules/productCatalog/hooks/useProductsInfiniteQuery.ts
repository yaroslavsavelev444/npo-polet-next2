"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchProductsPage } from "../api";
import type { CatalogFilters, ProductsPageResponse } from "../types/filters";

const PAGE_SIZE = 24;

interface Params {
	categoryId: string;
	filters: CatalogFilters;
	initialPage: ProductsPageResponse;
}

/**
 * Первая страница уже посчитана на сервере вместе с самой страницей
 * категории (см. app/(frontend)/category/[categorySlug]/page.tsx) и
 * прокидывается сюда как initialData — на клиенте она НЕ перезапрашивается.
 * queryKey включает сигнатуру фильтров/сортировки: при их смене
 * Server Component категории пересчитывает первую страницу заново и рендерит
 * этот хук с новым initialPage под новый ключ, так что и после смены
 * фильтров дублирующего запроса за уже готовыми данными не происходит —
 * довычитывается только вторая и последующие страницы.
 */
export function useProductsInfiniteQuery({
	categoryId,
	filters,
	initialPage,
}: Params) {
	return useInfiniteQuery({
		queryKey: [
			"catalog-products",
			categoryId,
			filters.status,
			filters.priceFrom ?? null,
			filters.priceTo ?? null,
			filters.field,
			filters.order,
		],
		queryFn: ({ pageParam }) =>
			fetchProductsPage({
				categoryId,
				cursor: pageParam,
				limit: PAGE_SIZE,
				filters,
			}),
		initialPageParam: 1,
		getNextPageParam: (lastPage) => lastPage.nextCursor,
		initialData: {
			pages: [initialPage],
			pageParams: [1],
		},
		staleTime: 60_000,
	});
}
