import { z } from "zod";
import type { KnowledgeFilters } from "../types";

/**
 * Разбор параметров адреса страницы базы знаний.
 *
 * Схема, а не чтение полей напрямую: параметры приходят из URL, то есть
 * полностью контролируются отправителем, и «page=-1», «page=1e9» или массив
 * значений вместо строки не должны доезжать до слоя запросов. Всё, что не
 * прошло проверку, схлопывается в состояние по умолчанию — пустой поиск без
 * фильтров.
 */
const SLUG = z
	.string()
	.trim()
	.min(1)
	.max(200)
	.regex(/^[a-z0-9-]+$/i);

const schema = z.object({
	q: z.string().trim().max(200).optional(),
	category: SLUG.optional(),
	section: SLUG.optional(),
	page: z.coerce.number().int().min(1).max(999).optional(),
});

const DEFAULTS: KnowledgeFilters = {
	q: "",
	category: null,
	section: null,
	page: 1,
};

export function parseKnowledgeSearchParams(
	searchParams: Record<string, string | string[] | undefined>,
): KnowledgeFilters {
	const parsed = schema.safeParse(searchParams);
	if (!parsed.success) return DEFAULTS;

	const { q, category, section, page } = parsed.data;

	return {
		q: q ?? "",
		category: category ?? null,
		// Секция без раздела бессмысленна: она всегда принадлежит разделу, и
		// одиночный ?section= показывал бы фильтр, которого нет в интерфейсе.
		section: category ? (section ?? null) : null,
		page: page ?? 1,
	};
}
