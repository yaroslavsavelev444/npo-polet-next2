/** Общие ключи React Query — единое место, чтобы список и счётчик всегда инвалидировались синхронно. */
export const notificationsKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationsKeys.all, "list"] as const,
  unreadCount: () => [...notificationsKeys.all, "unread-count"] as const,
};
