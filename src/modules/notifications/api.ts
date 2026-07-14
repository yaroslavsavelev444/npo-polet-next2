import type {
  MarkReadResponse,
  NotificationsPageResponse,
} from "./types";

async function parseJsonOrThrow<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body && "error" in body && body.error) || fallbackMessage);
  }
  return res.json() as Promise<T>;
}

export async function fetchNotificationsPage(
  cursor: number,
  limit = 15,
): Promise<NotificationsPageResponse> {
  const res = await fetch(`/api/notifications?cursor=${cursor}&limit=${limit}`);
  return parseJsonOrThrow<NotificationsPageResponse>(res, "Не удалось загрузить уведомления");
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await fetch("/api/notifications/unread-count");
  const { count } = await parseJsonOrThrow<{ count: number }>(
    res,
    "Не удалось получить счётчик уведомлений",
  );
  return count;
}

export async function markAllNotificationsAsRead(): Promise<MarkReadResponse> {
  const res = await fetch("/api/notifications/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true }),
  });
  return parseJsonOrThrow<MarkReadResponse>(res, "Не удалось отметить уведомления прочитанными");
}
