import type { Where } from "payload";
import type { Product } from "../../../payload-types";
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_RESULTS_LIMIT,
} from "../../modules/search/constants";
import { mapProductToSearchResult } from "../../modules/search/lib/adapter";
import type { SearchResultProduct } from "../../modules/search/types";
import { getPayloadInstance } from "./getPayload";

export interface SearchProductsOptions {
  query: string;
  limit?: number;
}

export async function searchProducts({
  query,
  limit = SEARCH_RESULTS_LIMIT,
}: SearchProductsOptions): Promise<SearchResultProduct[]> {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length < SEARCH_MIN_QUERY_LENGTH) {
    return [];
  }

  const payload = await getPayloadInstance();

  const where: Where = {
    and: [
      { _status: { equals: "published" } },
      { "inventory.status": { not_equals: "discontinued" } },
      { "inventory.isVisible": { not_equals: false } },
      {
        or: [
          { title: { like: trimmedQuery } },
          { description: { like: trimmedQuery } },
          { "specifications.value": { like: trimmedQuery } },
        ],
      },
    ],
  };

  const result = await payload.find({
    collection: "products",
    where,
    locale: "ru",
    limit,
    depth: 1,
    sort: "-analytics.viewsCount",
    overrideAccess: true,
  });

  return (result.docs as unknown as Product[]).map(mapProductToSearchResult);
}
