"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchUnreadCount } from "../api";
import { notificationsKeys } from "../queryKeys";

/**
 * Бейдж на колокольчике. Без WebSocket "живость" даёт периодический опрос +
 * рефетч при возврате фокуса на вкладку — то есть счётчик отстаёт максимум
 * на REFETCH_INTERVAL_MS или до следующего переключения на вкладку,
 * что для уведомлений на витрине магазина более чем достаточно.
 */
const REFETCH_INTERVAL_MS = 60_000;

export function useUnreadCount(initialCount: number) {
  return useQuery({
    queryKey: notificationsKeys.unreadCount(),
    queryFn: fetchUnreadCount,
    initialData: initialCount,
    staleTime: 15_000,
    refetchInterval: REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}
