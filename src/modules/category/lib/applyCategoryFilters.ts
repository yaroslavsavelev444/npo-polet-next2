import type { Category } from "@/payload-types";
import type { CategoryFilters } from "../types/filters";

/** Серверная фильтрация/сортировка — весь список категорий помещается в память (limit 200). */
export function applyCategoryFilters(
	categories: Category[],
	filters: CategoryFilters,
): Category[] {
	const search = filters.q?.trim().toLowerCase() ?? "";

	let result = categories;

	if (search.length > 0) {
		result = result.filter((category) => {
			const values = [
				category.name,
				category.subtitle,
				category.description,
				category.slug,
				...(category.keywords?.map((item) =>
					typeof item === "object" ? item.keyword : "",
				) ?? []),
			];

			return values.some(
				(value) =>
					typeof value === "string" && value.toLowerCase().includes(search),
			);
		});
	}

	const sign = filters.order === "asc" ? 1 : -1;

	result = [...result].sort((a, b) => {
		switch (filters.field) {
			case "name":
				return sign * a.name.localeCompare(b.name, "ru");
			case "createdAt":
				return (
					sign *
					(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
				);
			default:
				return sign * ((a.order ?? 0) - (b.order ?? 0));
		}
	});

	return result;
}
