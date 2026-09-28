import { ProductCardData } from "@/modules/productCard";

export type SortField =
	| "createdAt"
	| "price"
	| "title"
	| "viewsCount"
	| "purchasesCount"
	| "rating";
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

/**
 * Выбор в фасете характеристики: список значений (ИЛИ внутри фасета) либо
 * диапазон в единицах показа фасета.
 */
export type SpecSelection = {
	values?: string[];
	min?: number;
	max?: number;
};

/**
 * Выбранные фасеты. Между фасетами — И, внутри фасета-списка — ИЛИ.
 * Ключи — нормализованные ключи (см. specNormalization.ts), а не сырые
 * строки характеристик.
 */
export type FacetSelection = {
	brands: string[];
	discount: boolean;
	specs: Record<string, SpecSelection>;
};

export type CatalogFilters = FilterState &
	SortState & { page: number; facets: FacetSelection };

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

/* ─── Фасеты в ответе сервера ─────────────────────────────────────────── */

export type FacetValue = {
	value: string;
	label: string;
	/** Сколько товаров даст выбор этого значения при остальных фильтрах. */
	count: number;
	selected: boolean;
};

export type ListFacet = {
	kind: "list";
	key: string;
	label: string;
	group: string | null;
	values: FacetValue[];
};

export type RangeFacet = {
	kind: "range";
	key: string;
	label: string;
	group: string | null;
	/** Единица показа («кВт»), в ней же min/max и значения в URL. */
	unit: string | null;
	min: number;
	max: number;
	selectedMin?: number;
	selectedMax?: number;
};

export type SpecFacet = ListFacet | RangeFacet;

export type CatalogFacets = {
	manufacturers: FacetValue[];
	/** null — в разделе нет товаров со скидкой (или скидка у всех). */
	discount: { count: number; selected: boolean } | null;
	specs: SpecFacet[];
};
