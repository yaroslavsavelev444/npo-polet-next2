// services/feedbacks.service.ts
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { Feedback } from "../../../payload-types";
import { env } from "../../env";
import { getPayloadInstance } from "./getPayload";

export interface GetFeedbacksOptions {
  status?:
    | "new"
    | "in_progress"
    | "resolved"
    | "closed"
    | "duplicate"
    | "wont_fix";
  type?: "bug" | "improvement" | "feature" | "other";
  priority?: "low" | "medium" | "high" | "critical";
  user?: string;
  assignedTo?: string;
  tags?: string[];
  search?: string;
  sort?: string;
  limit?: number;
  page?: number;
  depth?: number;
}

function buildFeedbacksWhere(options: GetFeedbacksOptions): Where {
  const where: Where = {};
  const conditions: any[] = [];

  if (options.status) {
    conditions.push({ status: { equals: options.status } });
  }
  if (options.type) {
    conditions.push({ type: { equals: options.type } });
  }
  if (options.priority) {
    conditions.push({ priority: { equals: options.priority } });
  }
  if (options.user) {
    conditions.push({ user: { equals: options.user } });
  }
  if (options.assignedTo) {
    conditions.push({ assignedTo: { equals: options.assignedTo } });
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

function getFeedbacksCacheKey(options?: GetFeedbacksOptions): string {
  const {
    status,
    type,
    priority,
    user,
    assignedTo,
    tags,
    search,
    sort,
    limit,
    page,
    depth,
  } = options || {};
  const tagsKey = tags ? tags.join("-") : "any";
  return `feedbacks-st-${status || "any"}-tp-${type || "any"}-pr-${priority || "any"}-usr-${user || "any"}-asg-${assignedTo || "any"}-tags-${tagsKey}-srch-${search || "any"}-sort-${sort || "createdAt"}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`;
}

async function fetchFeedbacks(options: GetFeedbacksOptions = {}) {
  const payload = await getPayloadInstance();
  const where = buildFeedbacksWhere(options);
  const result = await payload.find({
    collection: "feedbacks",
    where,
    sort: options.sort || "createdAt",
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  });
  return {
    docs: result.docs as unknown as Feedback[],
    totalDocs: result.totalDocs,
  };
}

export const getCachedFeedbacks = (options?: GetFeedbacksOptions) => {
  const fetchFn = () => fetchFeedbacks(options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [getFeedbacksCacheKey(options)], {
    tags: ["feedbacks"],
    revalidate: false,
  })();
};

async function fetchFeedbackById(id: string): Promise<Feedback | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "feedbacks",
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as Feedback | null;
}

export const getCachedFeedbackById = (id: string) => {
  const fetchFn = () => fetchFeedbackById(id);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`feedback-${id}`], {
    tags: ["feedbacks"],
    revalidate: false,
  })();
};

async function fetchFeedbacksByUser(
  userId: string,
  options: Omit<GetFeedbacksOptions, "user"> = {},
) {
  return fetchFeedbacks({ ...options, user: userId });
}

export const getCachedFeedbacksByUser = (
  userId: string,
  options?: Omit<GetFeedbacksOptions, "user">,
) => {
  const fetchFn = () => fetchFeedbacksByUser(userId, options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  const cacheKey = `feedbacks-user-${userId}-${getFeedbacksCacheKey({ ...options, user: userId })}`;
  return unstable_cache(fetchFn, [cacheKey], {
    tags: ["feedbacks"],
    revalidate: false,
  })();
};

export async function createFeedback(data: {
  type: "bug" | "improvement" | "feature" | "other";
  title: string;
  description: string;
  email?: string;
  user?: number; // Payload user ID
}): Promise<Feedback> {
  const payload = await getPayloadInstance();

  const feedback = await payload.create({
    collection: "feedbacks",
    data: {
      type: data.type,
      title: data.title,
      description: data.description,
      email: data.email || "",
      user: data.user || undefined,
      status: "new",
      priority: "medium",
      // Поля assignedTo, tags и другие можно не передавать — они останутся пустыми
    },
  });

  return feedback as unknown as Feedback;
}
