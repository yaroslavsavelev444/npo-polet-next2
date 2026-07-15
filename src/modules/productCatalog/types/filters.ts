import { ProductCardData } from "@/modules/productCard";

export type SortField =
	| "createdAt"
	| "price"
	| "title"
	| "viewsCount"
	| "purchasesCount";
export type SortOrder = "asc" | "desc";

export type ProductStatusFilter =
	| "all"
	| "available"
	| "preorder"
	| "out_of_stock";

export type FilterState = {
	priceFrom?: number;
	priceTo?: number;
	status: ProductStatusFilter;
};

export type SortState = {
	field: SortField;
	order: SortOrder;
};

export type CatalogFilters = FilterState & SortState & { page: number };

export type PriceBounds = {
	min: number;
	max: number;
};

export type ProductCatalogResult = {
	products: ProductCardData[];
	totalDocs: number;
	pagination: {
		page: number;
		limit: number;
		totalPages: number;
		hasNextPage: boolean;
		hasPrevPage: boolean;
	};
};

/** Ответ GET /api/products — та же форма, что и первая страница с сервера,
 *  плюс курсор для следующей подгрузки при infinite scroll. */
export type ProductsPageResponse = ProductCatalogResult & {
	nextCursor: number | null;
};
