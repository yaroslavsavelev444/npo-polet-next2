// services/knowledge-topics.service.ts
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { KnowledgeTopic } from "../../../payload-types";
import { env } from "../../env";
import { getPayloadInstance } from "./getPayload";

export interface GetKnowledgeTopicsOptions {
  published?: boolean;
  featured?: boolean;
  tags?: string[];
  search?: string;
  sort?: string;
  limit?: number;
  page?: number;
  depth?: number;
}

function buildKnowledgeTopicsWhere(options: GetKnowledgeTopicsOptions): Where {
  const where: Where = {};
  const conditions: any[] = [];

  if (options.published !== undefined) {
    conditions.push({ published: { equals: options.published } });
  }
  if (options.featured !== undefined) {
    conditions.push({ featured: { equals: options.featured } });
  }
  if (options.tags && options.tags.length > 0) {
    conditions.push({ tags: { contains: options.tags[0] } });
  }
  if (options.search) {
    conditions.push({
      or: [
        { title: { contains: options.search } },
        { description: { contains: options.search } },
      ],
    });
  }

  if (conditions.length > 0) {
    where.and = conditions;
  }
  return where;
}

function getKnowledgeTopicsCacheKey(
  options?: GetKnowledgeTopicsOptions,
): string {
  const { published, featured, tags, search, sort, limit, page, depth } =
    options || {};
  const tagsKey = tags ? tags.join("-") : "any";
  return `knowledgetopics-pub-${published ?? "any"}-feat-${featured ?? "any"}-tags-${tagsKey}-srch-${search || "any"}-sort-${sort || "position"}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`;
}

async function fetchKnowledgeTopics(options: GetKnowledgeTopicsOptions = {}) {
  const payload = await getPayloadInstance();
  const where = buildKnowledgeTopicsWhere(options);
  const result = await payload.find({
    collection: "knowledge-topics",
    where,
    sort: options.sort || "position",
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  });
  return {
    docs: result.docs as unknown as KnowledgeTopic[],
    totalDocs: result.totalDocs,
  };
}

export const getCachedKnowledgeTopics = (
  options?: GetKnowledgeTopicsOptions,
) => {
  const fetchFn = () => fetchKnowledgeTopics(options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [getKnowledgeTopicsCacheKey(options)], {
    tags: ["knowledge-topics"],
    revalidate: false,
  })();
};

async function fetchKnowledgeTopicById(
  id: string,
): Promise<KnowledgeTopic | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "knowledge-topics",
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as KnowledgeTopic | null;
}

export const getCachedKnowledgeTopicById = (id: string) => {
  const fetchFn = () => fetchKnowledgeTopicById(id);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`knowledge-topic-${id}`], {
    tags: ["knowledge-topics"],
    revalidate: false,
  })();
};

async function fetchKnowledgeTopicBySlug(
  slug: string,
): Promise<KnowledgeTopic | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "knowledge-topics",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as KnowledgeTopic | null;
}

export const getCachedKnowledgeTopicBySlug = (slug: string) => {
  const fetchFn = () => fetchKnowledgeTopicBySlug(slug);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`knowledge-topic-slug-${slug}`], {
    tags: ["knowledge-topics"],
    revalidate: false,
  })();
};
