// services/companies.service.ts
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { Company } from "../../../payload-types";
import { env } from "../../env";
import { getPayloadInstance } from "./getPayload";

export interface GetCompaniesOptions {
  user?: string;
  taxNumber?: string;
  companyName?: string;
  sort?: string;
  limit?: number;
  page?: number;
  depth?: number;
}

function buildCompaniesWhere(options: GetCompaniesOptions): Where {
  const where: Where = {};
  const conditions: any[] = [];

  if (options.user) {
    conditions.push({ user: { equals: options.user } });
  }
  if (options.taxNumber) {
    conditions.push({ taxNumber: { equals: options.taxNumber } });
  }
  if (options.companyName) {
    conditions.push({ companyName: { contains: options.companyName } });
  }

  if (conditions.length > 0) {
    where.and = conditions;
  }
  return where;
}

function getCompaniesCacheKey(options?: GetCompaniesOptions): string {
  const { user, taxNumber, companyName, sort, limit, page, depth } =
    options || {};
  return `companies-user-${user || "any"}-tax-${taxNumber || "any"}-name-${companyName || "any"}-sort-${sort || "createdAt"}-l-${limit || 20}-p-${page || 1}-d-${depth ?? 1}`;
}

async function fetchCompanies(options: GetCompaniesOptions = {}) {
  const payload = await getPayloadInstance();
  const where = buildCompaniesWhere(options);
  const result = await payload.find({
    collection: "companies",
    where,
    sort: options.sort || "createdAt",
    limit: options.limit || 20,
    page: options.page || 1,
    depth: options.depth ?? 1,
  });
  return {
    docs: result.docs as unknown as Company[],
    totalDocs: result.totalDocs,
  };
}

export const getCachedCompanies = (options?: GetCompaniesOptions) => {
  const fetchFn = () => fetchCompanies(options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [getCompaniesCacheKey(options)], {
    tags: ["companies"],
    revalidate: false,
  })();
};

async function fetchCompanyById(id: string): Promise<Company | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "companies",
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as Company | null;
}

export const getCachedCompanyById = (id: string) => {
  const fetchFn = () => fetchCompanyById(id);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`company-${id}`], {
    tags: ["companies"],
    revalidate: false,
  })();
};

async function fetchCompanyByTaxNumber(
  taxNumber: string,
): Promise<Company | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "companies",
    where: { taxNumber: { equals: taxNumber } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as Company | null;
}

export const getCachedCompanyByTaxNumber = (taxNumber: string) => {
  const fetchFn = () => fetchCompanyByTaxNumber(taxNumber);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`company-tax-${taxNumber}`], {
    tags: ["companies"],
    revalidate: false,
  })();
};

async function fetchCompaniesByUser(
  userId: string,
  options: Omit<GetCompaniesOptions, "user"> = {},
) {
  return fetchCompanies({ ...options, user: userId });
}

export const getCachedCompaniesByUser = (
  userId: string,
  options?: Omit<GetCompaniesOptions, "user">,
) => {
  const fetchFn = () => fetchCompaniesByUser(userId, options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  const cacheKey = `companies-user-${userId}-${getCompaniesCacheKey({ ...options, user: userId })}`;
  return unstable_cache(fetchFn, [cacheKey], {
    tags: ["companies"],
    revalidate: false,
  })();
};
