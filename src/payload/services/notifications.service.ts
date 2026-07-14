// services/notifications.service.ts
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { Notification } from "../../../payload-types";
import { env } from "../../env";
import { getPayloadInstance } from "./getPayload";

export interface GetNotificationsOptions {
  user?: string;
  type?: string;
  isRead?: boolean;
  pushStatus?: "pending" | "sent" | "failed";
  sort?: string;
  limit?: number;
  page?: number;
  depth?: number;
}

function buildNotificationsWhere(options: GetNotificationsOptions): Where {
  const where: Where = {};
  const conditions: any[] = [];

  if (options.user) {
    conditions.push({ user: { equals: options.user } });
  }
  if (options.type) {
    conditions.push({ type: { equals: options.type } });
  }
  if (options.isRead !== undefined) {
    conditions.push({ isRead: { equals: options.isRead } });
  }
  if (options.pushStatus) {
    conditions.push({ pushStatus: { equals: options.pushStatus } });
  }

  if (conditions.length > 0) {
    where.and = conditions;
  }
  return where;
}

function getNotificationsCacheKey(options?: GetNotificationsOptions): string {
  const { user, type, isRead, pushStatus, sort, limit, page, depth } =
    options || {};
  return `notifications-user-${user || "any"}-type-${type || "any"}-read-${isRead ?? "any"}-push-${pushStatus || "any"}-sort-${sort || "createdAt"}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`;
}

async function fetchNotifications(options: GetNotificationsOptions = {}) {
  const payload = await getPayloadInstance();
  const where = buildNotificationsWhere(options);
  const result = await payload.find({
    collection: "notifications",
    where,
    sort: options.sort || "createdAt",
    limit: options.limit || 100,
    page: options.page || 1,
    depth: options.depth ?? 1,
  });
  return {
    docs: result.docs as unknown as Notification[],
    totalDocs: result.totalDocs,
  };
}

export const getCachedNotifications = (options?: GetNotificationsOptions) => {
  const fetchFn = () => fetchNotifications(options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [getNotificationsCacheKey(options)], {
    tags: ["notifications"],
    revalidate: false,
  })();
};

async function fetchNotificationById(id: string): Promise<Notification | null> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "notifications",
    where: { id: { equals: id } },
    limit: 1,
    depth: 1,
  });
  return (result.docs[0] || null) as unknown as Notification | null;
}

export const getCachedNotificationById = (id: string) => {
  const fetchFn = () => fetchNotificationById(id);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  return unstable_cache(fetchFn, [`notification-${id}`], {
    tags: ["notifications"],
    revalidate: false,
  })();
};

async function fetchNotificationsByUser(
  userId: string,
  options: Omit<GetNotificationsOptions, "user"> = {},
) {
  return fetchNotifications({ ...options, user: userId });
}

export const getCachedNotificationsByUser = (
  userId: string,
  options?: Omit<GetNotificationsOptions, "user">,
) => {
  const fetchFn = () => fetchNotificationsByUser(userId, options);
  if (env.NODE_ENV === "development") {
    return fetchFn();
  }
  const cacheKey = `notifications-user-${userId}-${getNotificationsCacheKey({ ...options, user: userId })}`;
  return unstable_cache(fetchFn, [cacheKey], {
    tags: ["notifications"],
    revalidate: false,
  })();
};

// ─── Бэлл в шапке: список/счётчик/прочтение ────────────────────────────────
//
// Намеренно БЕЗ unstable_cache выше: это персональные, часто меняющиеся
// данные (открыл бэлл → часть непрочитанных тут же становится прочитанной),
// а Next Data Cache — общий на сервер кеш по тегам, не per-request и не
// per-user, и плохо подходит для "счётчик должен быть точным прямо сейчас".
// Свежесть на клиенте обеспечивает React Query (см. modules/notifications).

export interface NotificationsPageResult {
  docs: Notification[];
  hasNextPage: boolean;
  nextPage: number | null;
  totalDocs: number;
}

export async function listNotificationsPage(
  userId: string | number,
  { page = 1, limit = 15 }: { page?: number; limit?: number } = {},
): Promise<NotificationsPageResult> {
  const payload = await getPayloadInstance();
  const result = await payload.find({
    collection: "notifications",
    where: { user: { equals: userId } },
    sort: "-createdAt",
    page,
    limit,
    overrideAccess: true,
  });

  return {
    docs: result.docs as unknown as Notification[],
    hasNextPage: result.hasNextPage,
    nextPage: result.nextPage ?? null,
    totalDocs: result.totalDocs,
  };
}

export async function getUnreadNotificationCount(
  userId: string | number,
): Promise<number> {
  const payload = await getPayloadInstance();
  const { totalDocs } = await payload.count({
    collection: "notifications",
    where: {
      and: [{ user: { equals: userId } }, { isRead: { equals: false } }],
    },
    overrideAccess: true,
  });
  return totalDocs;
}

/** Помечает прочитанными указанные уведомления, но только принадлежащие userId — защита от чужих id в теле запроса. */
export async function markNotificationsReadForUser(
  userId: string | number,
  ids: Array<number | string>,
): Promise<number> {
  if (ids.length === 0) return 0;
  const payload = await getPayloadInstance();
  const result = await payload.update({
    collection: "notifications",
    where: {
      and: [
        { user: { equals: userId } },
        { id: { in: ids } },
        { isRead: { equals: false } },
      ],
    },
    data: { isRead: true },
    overrideAccess: true,
  });
  return result.docs.length;
}

export async function markAllNotificationsReadForUser(
  userId: string | number,
): Promise<number> {
  const payload = await getPayloadInstance();
  const result = await payload.update({
    collection: "notifications",
    where: {
      and: [{ user: { equals: userId } }, { isRead: { equals: false } }],
    },
    data: { isRead: true },
    overrideAccess: true,
  });
  return result.docs.length;
}
