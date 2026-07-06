// services/categories.service.ts
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import { env } from "@/env";
import type { Category } from "@/payload-types";
import { getPayloadInstance } from "./getPayload";

export interface GetCategoriesOptions {
  isActive?: boolean;
  sort?: string;
  limit?: number;
  page?: number;
  depth?: number;
}

function buildCategoriesWhere(options: GetCategoriesOptions): Where {
  const where: Where = {};
  const conditions: any[] = [];

  if (options.isActive !== undefined) {
    conditions.push({ isActive: { equals: options.isActive } });
  }

  if (conditions.length > 0) {
    where.and = conditions;
  }
  return where;
}

function getCategoriesCacheKey(options?: GetCategoriesOptions): string {
  const { isActive, sort, limit, page, depth } = options || {};
  return `categories-active-${isActive ?? "any"}-sort-${sort || "order"}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`;
}

async function fetchCategories(options: GetCategoriesOptions = {}) {
  const payload = await getPayloadInstance();
  const where = buildCategoriesWhere(options);
  const result = await payload.find({
    collection: "categories",
    where,
    sort: options.sort || "order",
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  });
  return {
    docs: result.docs as unknown as Category[],
    totalDocs: result.totalDocs,
  };
}

export const getCachedCategories = (options?: GetCategoriesOptions) => {
  const fetchFn = () => fetchCategories(options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [getCategoriesCacheKey(options)], {
    tags: ["categories"],
    revalidate: false,
  })();
};

async function fetchCategoryBySlug(slug: string): Promise<Category | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "categories",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as Category | null;
}

export const getCachedCategoryBySlug = (slug: string) => {
  const fetchFn = () => fetchCategoryBySlug(slug);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`category-${slug}`], {
    tags: ["categories"],
    revalidate: false,
  })();
};

async function fetchCategoryById(id: string): Promise<Category | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "categories",
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as Category | null;
}

export const getCachedCategoryById = (id: string) => {
  const fetchFn = () => fetchCategoryById(id);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`category-${id}`], {
    tags: ["categories"],
    revalidate: false,
  })();
};
