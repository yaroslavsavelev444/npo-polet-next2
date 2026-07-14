"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markAllNotificationsAsRead } from "../api";
import { notificationsKeys } from "../queryKeys";
import type { NotificationsPageResponse } from "../types";
import type { InfiniteData } from "@tanstack/react-query";

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: ({ unreadCount }) => {
      queryClient.setQueryData(notificationsKeys.unreadCount(), unreadCount);
      queryClient.setQueryData<InfiniteData<NotificationsPageResponse>>(
        notificationsKeys.list(),
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => ({ ...item, isRead: true })),
            })),
          },
      );
    },
  });
}
