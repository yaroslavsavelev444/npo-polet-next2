import type { CategorySortField, CategorySortOrder } from "../types/filters";

// Единый источник вариантов сортировки — используется и десктопным
// Dropdown, и (при необходимости) мобильным UI, чтобы список не расходился.
export interface CategorySortOption {
	value: string;
	field: CategorySortField;
	order: CategorySortOrder;
	label: string;
}

export const CATEGORY_SORT_OPTIONS: CategorySortOption[] = [
	{ value: "order-asc", field: "order", order: "asc", label: "По умолчанию" },
	{
		value: "name-asc",
		field: "name",
		order: "asc",
		label: "По алфавиту А-Я",
	},
	{
		value: "name-desc",
		field: "name",
		order: "desc",
		label: "По алфавиту Я-А",
	},
	{
		value: "createdAt-desc",
		field: "createdAt",
		order: "desc",
		label: "Сначала новые",
	},
	{
		value: "createdAt-asc",
		field: "createdAt",
		order: "asc",
		label: "Сначала старые",
	},
];

export function findCategorySortOption(
	field: CategorySortField,
	order: CategorySortOrder,
): CategorySortOption {
	return (
		CATEGORY_SORT_OPTIONS.find((o) => o.field === field && o.order === order) ??
		CATEGORY_SORT_OPTIONS[0]
	);
}

/** "1 категория" / "3 категории" / "5 категорий" — русское склонение по числу. */
export function pluralizeCategories(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "категория";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "категории";
	return "категорий";
}
