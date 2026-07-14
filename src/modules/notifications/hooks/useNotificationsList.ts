"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchNotificationsPage } from "../api";
import { notificationsKeys } from "../queryKeys";

const PAGE_SIZE = 15;

/**
 * NotificationPanel монтируется только когда дропдаун открыт (см.
 * NotificationBell) — сам факт монтирования и есть "первая порция
 * загружается при открытии меню", отдельный `enabled`-флаг не нужен.
 * Повторные открытия переиспользуют кеш React Query, пока не истёк
 * staleTime — на глаз это ощущается как мгновенное открытие.
 */
export function useNotificationsList() {
  return useInfiniteQuery({
    queryKey: notificationsKeys.list(),
    queryFn: ({ pageParam }) => fetchNotificationsPage(pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
  });
}
