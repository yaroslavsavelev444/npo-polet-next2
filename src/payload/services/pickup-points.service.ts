// services/pickup-points.service.ts
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { PickupPoint } from "../../../payload-types";
import { env } from "../../env";
import { getPayloadInstance } from "./getPayload";

export interface GetPickupPointsOptions {
  city?: string;
  sort?: string;
  limit?: number;
  page?: number;
  depth?: number;
}

function buildPickupPointsWhere(options: GetPickupPointsOptions): Where {
  const where: Where = {};
  const conditions: any[] = [];

  if (options.city) {
    conditions.push({ city: { equals: options.city } });
  }

  if (conditions.length > 0) {
    where.and = conditions;
  }
  return where;
}

function getPickupPointsCacheKey(options?: GetPickupPointsOptions): string {
  const { city, sort, limit, page, depth } = options || {};
  return `pickuppoints-city-${city || "any"}-sort-${sort || "name"}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`;
}

async function fetchPickupPoints(options: GetPickupPointsOptions = {}) {
  const payload = await getPayloadInstance();
  const where = buildPickupPointsWhere(options);
  const result = await payload.find({
    collection: "pickup-points",
    where,
    sort: options.sort || "name",
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  });
  return {
    docs: result.docs as unknown as PickupPoint[],
    totalDocs: result.totalDocs,
  };
}

export const getCachedPickupPoints = (options?: GetPickupPointsOptions) => {
  const fetchFn = () => fetchPickupPoints(options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [getPickupPointsCacheKey(options)], {
    tags: ["pickup-points"],
    revalidate: false,
  })();
};

async function fetchPickupPointById(id: string): Promise<PickupPoint | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "pickup-points",
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as PickupPoint | null;
}

export const getCachedPickupPointById = (id: string) => {
  const fetchFn = () => fetchPickupPointById(id);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`pickup-point-${id}`], {
    tags: ["pickup-points"],
    revalidate: false,
  })();
};
