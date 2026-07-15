import type {
	ProductStatusFilter,
	SortField,
	SortOrder,
} from "../types/filters";

// Единый источник вариантов сортировки — используется и десктопным
// Dropdown, и мобильным Sheet, чтобы список не расходился между ними.
export interface SortOption {
	value: string;
	field: SortField;
	order: SortOrder;
	label: string;
}

export const SORT_OPTIONS: SortOption[] = [
	{
		value: "createdAt-desc",
		field: "createdAt",
		order: "desc",
		label: "Сначала новые",
	},
	{
		value: "price-asc",
		field: "price",
		order: "asc",
		label: "Сначала дешевле",
	},
	{
		value: "price-desc",
		field: "price",
		order: "desc",
		label: "Сначала дороже",
	},
	{
		value: "purchasesCount-desc",
		field: "purchasesCount",
		order: "desc",
		label: "По популярности",
	},
	{
		value: "viewsCount-desc",
		field: "viewsCount",
		order: "desc",
		label: "По просмотрам",
	},
	{
		value: "title-asc",
		field: "title",
		order: "asc",
		label: "По названию А-Я",
	},
];

export function sortOptionKey(field: SortField, order: SortOrder): string {
	return `${field}-${order}`;
}

export function findSortOption(field: SortField, order: SortOrder): SortOption {
	return (
		SORT_OPTIONS.find((o) => o.field === field && o.order === order) ??
		SORT_OPTIONS[0]
	);
}

export const STATUS_OPTIONS: { value: ProductStatusFilter; label: string }[] = [
	{ value: "all", label: "Все товары" },
	{ value: "available", label: "В наличии" },
	{ value: "preorder", label: "Под заказ" },
	{ value: "out_of_stock", label: "Нет в наличии" },
];

export function statusLabel(value: ProductStatusFilter): string {
	return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/** "1 товар" / "3 товара" / "5 товаров" — русское склонение по числу. */
export function pluralizeProducts(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "товар";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "товара";
	return "товаров";
}
