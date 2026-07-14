"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellOff, CheckCheck } from "lucide-react";
import { Spinner } from "@/UI/Spinner/Spinner";
import { Empty } from "@/UI/Empty/Empty";
import { useMarkAllAsRead } from "../hooks/useMarkAllAsRead";
import { useNotificationsList } from "../hooks/useNotificationsList";
import { notificationsKeys } from "../queryKeys";
import { NotificationListItem } from "./NotificationListItem";

interface NotificationPanelProps {
  onNavigate: () => void;
}

/**
 * Содержимое дропдауна. Монтируется только пока открыт — см.
 * NotificationBell — этим и обеспечена "первая порция при открытии".
 */
export function NotificationPanel({ onNavigate }: NotificationPanelProps) {
  const queryClient = useQueryClient();
  const {
    data,
    status,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useNotificationsList();
  const markAllAsRead = useMarkAllAsRead();

  // Каждая подгруженная страница уже прочитана бэкендом (см. комментарий в
  // app/api/notifications/route.ts) и несёт свежий unreadCount — синхронно
  // прокидываем его в кеш бейджа, чтобы не делать лишний запрос.
  const latestUnreadCount = data?.pages.at(-1)?.unreadCount;
  useEffect(() => {
    if (latestUnreadCount !== undefined) {
      queryClient.setQueryData(notificationsKeys.unreadCount(), latestUnreadCount);
    }
  }, [latestUnreadCount, queryClient]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "80px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const hasUnread = (latestUnreadCount ?? 0) > 0;

  return (
    <div className="flex max-h-[28rem] w-full flex-col sm:w-[380px]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          Уведомления
        </span>
        {hasUnread && (
          <button
            type="button"
            onClick={() => markAllAsRead.mutate()}
            disabled={markAllAsRead.isPending}
            className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)] disabled:opacity-50"
          >
            <CheckCheck size={14} aria-hidden />
            Прочитать всё
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === "pending" && (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse">
                <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--surface-secondary)]" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-3/4 rounded bg-[var(--surface-secondary)]" />
                  <div className="h-3 w-full rounded bg-[var(--surface-secondary)]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              {error instanceof Error ? error.message : "Не удалось загрузить уведомления"}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
            >
              Повторить
            </button>
          </div>
        )}

        {status === "success" && items.length === 0 && (
          <Empty
            size="sm"
            icon={<BellOff className="h-full w-full" strokeWidth={1.25} />}
            message="Уведомлений пока нет"
            description="Здесь появятся события по вашим заказам, отзывам и аккаунту"
            className="px-4 py-10"
          />
        )}

        {status === "success" && items.length > 0 && (
          <div className="divide-y divide-[var(--border)]">
            {items.map((item) => (
              <NotificationListItem key={item.id} notification={item} onNavigate={onNavigate} />
            ))}
            {hasNextPage && (
              <div ref={sentinelRef} className="flex justify-center py-3">
                {isFetchingNextPage && <Spinner size="sm" />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
