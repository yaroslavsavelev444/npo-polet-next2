import type { CatalogFilters, ProductsPageResponse } from "./types/filters";

async function parseJsonOrThrow<T>(
	res: Response,
	fallbackMessage: string,
): Promise<T> {
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error((body && "error" in body && body.error) || fallbackMessage);
	}
	return res.json() as Promise<T>;
}

export interface FetchProductsPageParams {
	categoryId: string;
	cursor: number;
	limit: number;
	filters: CatalogFilters;
}

export async function fetchProductsPage({
	categoryId,
	cursor,
	limit,
	filters,
}: FetchProductsPageParams): Promise<ProductsPageResponse> {
	const params = new URLSearchParams({
		categoryId,
		cursor: String(cursor),
		limit: String(limit),
		status: filters.status,
		sort: filters.field,
		order: filters.order,
	});
	if (filters.priceFrom !== undefined)
		params.set("priceFrom", String(filters.priceFrom));
	if (filters.priceTo !== undefined)
		params.set("priceTo", String(filters.priceTo));

	const res = await fetch(`/api/catalog/products?${params.toString()}`);
	return parseJsonOrThrow<ProductsPageResponse>(
		res,
		"Не удалось загрузить товары",
	);
}
