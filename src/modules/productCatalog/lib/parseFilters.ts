import { z } from "zod";
import type { CatalogFilters } from "../types/filters";
import { EMPTY_FACET_SELECTION, readFacetSelection } from "./facetParams";

const catalogFiltersSchema = z.object({
	priceFrom: z.coerce.number().min(0).optional(),
	priceTo: z.coerce.number().min(0).optional(),
	status: z
		.enum(["all", "available", "preorder", "out_of_stock"])
		.optional()
		.default("all"),
	sort: z
		.enum([
			"createdAt",
			"price",
			"title",
			"viewsCount",
			"purchasesCount",
			"rating",
		])
		.optional()
		.default("createdAt"),
	order: z.enum(["asc", "desc"]).optional().default("desc"),
	page: z.coerce.number().int().positive().optional().default(1),
});

const DEFAULT_FILTERS: CatalogFilters = {
	status: "all",
	field: "createdAt",
	order: "desc",
	page: 1,
	facets: EMPTY_FACET_SELECTION,
};

export function parseCatalogSearchParams(
	searchParams: Record<string, string | string[] | undefined>,
): CatalogFilters {
	const parsed = catalogFiltersSchema.safeParse(searchParams);
	if (!parsed.success)
		return { ...DEFAULT_FILTERS, facets: readFacetSelection(searchParams) };

	const { priceFrom, priceTo, status, sort, order, page } = parsed.data;
	// Пользователь мог перетащить ползунки местами — не роняем запрос, а меняем их местами.
	const swapped =
		priceFrom !== undefined && priceTo !== undefined && priceFrom > priceTo;

	return {
		priceFrom: swapped ? priceTo : priceFrom,
		priceTo: swapped ? priceFrom : priceTo,
		status,
		field: sort,
		order,
		page,
		// Фасеты здесь проверены только синтаксически. Сверка с фасетами
		// раздела — на сервере (sanitizeFacetSelection), когда они известны.
		facets: readFacetSelection(searchParams),
	};
}
