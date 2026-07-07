import { z } from "zod";
import type { FilterState, SortState } from "../types/filters";

const catalogFiltersSchema = z.object({
  priceFrom: z.coerce.number().optional(),
  priceTo: z.coerce.number().optional(),
  status: z
    .enum(["all", "available", "preorder", "out_of_stock"])
    .optional()
    .default("all"),
  inStock: z
    .enum(["true", "false"])
    .optional()
    .transform((val) => val === "true"),
  sort: z
    .enum(["createdAt", "price", "title", "viewsCount", "purchasesCount"])
    .optional()
    .default("createdAt"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().positive().optional().default(1),
});

export function parseCatalogSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): FilterState & SortState & { page: number } {
  try {
    const parsed = catalogFiltersSchema.parse(searchParams);
    return {
      priceFrom: parsed.priceFrom,
      priceTo: parsed.priceTo,
      status: parsed.status,
      inStock: parsed.inStock,
      field: parsed.sort,
      sort: parsed.sort,
      order: parsed.order,
      page: parsed.page,
    };
  } catch {
    return {
      status: "all",
      field: "createdAt",
      sort: "createdAt",
      order: "desc",
      page: 1,
    };
  }
}
