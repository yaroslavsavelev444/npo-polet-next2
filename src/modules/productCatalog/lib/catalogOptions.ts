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
		value: "rating-desc",
		field: "rating",
		order: "desc",
		label: "По рейтингу",
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

const facetNumberFormat = new Intl.NumberFormat("ru-RU", {
	maximumFractionDigits: 3,
});

/** Число фасета с единицей: «1 200 Вт», «0,4 кг». */
export function formatFacetNumber(value: number, unit?: string | null): string {
	const number = facetNumberFormat.format(value);
	return unit ? `${number} ${unit}` : number;
}

/**
 * Шаг шкалы числового фасета. Целые — шагом 1: крупный шаг не дотягивал бы
 * ползунок до максимума, если размах ему не кратен. Дробные — десятая доля
 * порядка размаха (0,4–2,5 кг → 0,1).
 */
export function rangeStep(min: number, max: number): number {
	if (Number.isInteger(min) && Number.isInteger(max)) return 1;
	const span = Math.max(max - min, Number.EPSILON);
	return Math.min(1, 10 ** Math.floor(Math.log10(span / 10)));
}
