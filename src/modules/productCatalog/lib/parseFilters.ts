// src/modules/productCatalog/lib/parseFilters.ts
import { z } from 'zod';
import type { FilterState, SortState } from '../types/filters';

const catalogFiltersSchema = z.object({
  priceFrom: z.coerce.number().optional(),
  priceTo: z.coerce.number().optional(),
  status: z.enum(['all', 'available', 'preorder', 'out_of_stock']).optional().default('all'),
  inStock: z.enum(['true', 'false']).optional().transform(val => val === 'true'),
  sort: z.enum(['createdAt', 'price', 'title', 'viewsCount', 'purchasesCount']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
});

export function parseCatalogSearchParams(searchParams: any): FilterState & SortState & { page: number } {
  try {
    return catalogFiltersSchema.parse(searchParams);
  } catch {
    // Fallback на безопасные значения
    return {
      status: 'all',
      sort: 'createdAt',
      order: 'desc',
      page: 1,
    };
  }
}