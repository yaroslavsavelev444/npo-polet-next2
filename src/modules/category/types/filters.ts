export type CategorySortField = "order" | "name" | "createdAt";
export type CategorySortOrder = "asc" | "desc";

export interface CategoryFilters {
	q?: string;
	field: CategorySortField;
	order: CategorySortOrder;
}
