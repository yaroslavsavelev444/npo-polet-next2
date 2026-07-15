import { z } from "zod";
import type { CategoryFilters } from "../types/filters";

const categoryFiltersSchema = z.object({
	q: z.string().trim().min(1).optional(),
	sort: z.enum(["order", "name", "createdAt"]).optional().default("order"),
	order: z.enum(["asc", "desc"]).optional().default("asc"),
});

const DEFAULT_FILTERS: CategoryFilters = { field: "order", order: "asc" };

export function parseCategorySearchParams(
	searchParams: Record<string, string | string[] | undefined>,
): CategoryFilters {
	const parsed = categoryFiltersSchema.safeParse(searchParams);
	if (!parsed.success) return DEFAULT_FILTERS;

	const { q, sort, order } = parsed.data;
	return { q, field: sort, order };
}
