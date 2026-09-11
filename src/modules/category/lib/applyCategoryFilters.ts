import type { CategoryCardData, CategoryFilters } from "../types/filters";

/**
 * Отбор и сортировка разделов каталога.
 *
 * Функция одна на оба прохода — серверный (первая отрисовка по URL, она же
 * попадает в HTML для поисковика и для выключенного JS) и клиентский (каждое
 * нажатие в поле поиска). Две реализации одного правила разошлись бы на
 * первом же уточнении: страница после гидратации показывала бы не то, что
 * отдал сервер.
 *
 * Весь список помещается в память (разделов десятки, выборка ограничена 200),
 * поэтому ни базы, ни индексов здесь не нужно.
 */
export function applyCategoryFilters(
	categories: CategoryCardData[],
	filters: CategoryFilters,
): CategoryCardData[] {
	const search = filters.q?.trim().toLowerCase() ?? "";

	const matched =
		search.length > 0
			? categories.filter((category) => category.search.includes(search))
			: categories;

	const sign = filters.order === "asc" ? 1 : -1;

	return [...matched].sort((a, b) => {
		switch (filters.field) {
			case "name":
				return sign * a.name.localeCompare(b.name, "ru");
			case "createdAt":
				return sign * (a.createdAt - b.createdAt);
			default:
				// У порядка из админки бывают дубли (несколько разделов с order 0).
				// Без вторичного ключа их взаимный порядок зависит от реализации
				// сортировки, то есть может меняться между отрисовками — глазом
				// это читается как «сетка переставилась сама».
				return sign * (a.order - b.order) || a.name.localeCompare(b.name, "ru");
		}
	});
}
