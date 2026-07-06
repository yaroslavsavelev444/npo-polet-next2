// services/banners.service.ts
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { Banner } from "../../../payload-types";
import { getPayloadInstance } from "./getPayload";

export interface GetBannersOptions {
  status?: "draft" | "active" | "scheduled" | "archived";
  startAt_gt?: string;
  endAt_lt?: string;
  role?: string;
  isSystem?: boolean;
  priority_min?: number;
  limit?: number;
  page?: number;
  sort?: string;
  depth?: number;
}

function buildBannersWhere(options: GetBannersOptions): Where {
  const where: Where = {};
  const conditions: any[] = [];

  if (options.status) {
    conditions.push({ status: { equals: options.status } });
  }
  if (options.startAt_gt) {
    conditions.push({ startAt: { greater_than: options.startAt_gt } });
  }
  if (options.endAt_lt) {
    conditions.push({ endAt: { less_than: options.endAt_lt } });
  }
  if (options.isSystem !== undefined) {
    conditions.push({ isSystem: { equals: options.isSystem } });
  }
  if (options.priority_min !== undefined) {
    conditions.push({ priority: { greater_than_equal: options.priority_min } });
  }
  if (options.role) {
    // targeting.roles содержит role ИЛИ пустой массив
    conditions.push({
      or: [
        { "targeting.roles": { contains: options.role } },
        { "targeting.roles": { equals: [] } },
      ],
    });
  }

  if (conditions.length > 0) {
    where.and = conditions;
  }
  return where;
}

async function fetchBanners(options: GetBannersOptions = {}) {
  const payload = await getPayloadInstance();
  const where = buildBannersWhere(options);
  const result = await payload.find({
    collection: "banners",
    where,
    sort: options.sort || "-priority",
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  });
  return {
    docs: result.docs as unknown as Banner[],
    totalDocs: result.totalDocs,
  };
}

function getBannersCacheKey(options: GetBannersOptions): string {
  const {
    status,
    startAt_gt,
    endAt_lt,
    role,
    isSystem,
    priority_min,
    limit,
    page,
    sort,
    depth,
  } = options;
  return `banners-st-${status || "any"}-sg-${startAt_gt || "any"}-el-${endAt_lt || "any"}-rl-${role || "any"}-sys-${isSystem ?? "any"}-pm-${priority_min ?? "any"}-l-${limit || 100}-p-${page || 1}-s-${sort || "-priority"}-d-${depth ?? 1}`;
}

export const getCachedBanners =
  process.env.NODE_ENV === "development"
    ? fetchBanners
    : (options: GetBannersOptions = {}) =>
        unstable_cache(
          () => fetchBanners(options),
          [getBannersCacheKey(options)],
          { tags: ["banners"], revalidate: false },
        )();

async function fetchBannerById(id: string): Promise<Banner | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "banners",
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as Banner | null;
}

export const getCachedBannerById = (id: string) =>
  process.env.NODE_ENV === "development"
    ? () => fetchBannerById(id)
    : unstable_cache(() => fetchBannerById(id), [`banner-${id}`], {
        tags: ["banners"],
        revalidate: false,
      });
