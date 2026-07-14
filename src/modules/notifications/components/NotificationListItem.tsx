import Link from "next/link";
import { cn } from "@/utils/cn";
import { formatRelativeTime } from "../lib/formatRelativeTime";
import { getNotificationVisual } from "../lib/notificationVisuals";
import type { NotificationDTO } from "../types";
import styles from "./NotificationBell.module.css";

interface NotificationListItemProps {
  notification: NotificationDTO;
  onNavigate?: () => void;
}

export function NotificationListItem({
  notification,
  onNavigate,
}: NotificationListItemProps) {
  const { Icon, className: iconClassName } = getNotificationVisual(notification.type);

  const content = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          iconClassName,
        )}
        aria-hidden
      >
        <Icon size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {notification.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">
          {notification.body}
        </p>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {formatRelativeTime(notification.createdAt)}
        </p>
      </div>

      {!notification.isRead && (
        <span
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]",
            styles.unreadDot,
          )}
          aria-label="Непрочитано"
        />
      )}
    </div>
  );

  const itemClassName = cn(
    styles.listItem,
    "block w-full text-left transition-colors duration-150 hover:bg-[var(--surface-secondary)]",
  );

  if (notification.link) {
    return (
      <Link href={notification.link} onClick={onNavigate} className={itemClassName}>
        {content}
      </Link>
    );
  }

  return <div className={itemClassName}>{content}</div>;
}
