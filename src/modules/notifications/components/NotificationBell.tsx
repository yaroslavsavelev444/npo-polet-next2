"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/utils/cn";
import { useUnreadCount } from "../hooks/useUnreadCount";
import { NotificationPanel } from "./NotificationPanel";
import styles from "./NotificationBell.module.css";

interface NotificationBellProps {
  initialUnreadCount: number;
}

export function NotificationBell({ initialUnreadCount }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(initialUnreadCount);

  const { data: unreadCount = initialUnreadCount } = useUnreadCount(initialUnreadCount);

  // Тонкий "звон" колокольчика, когда счётчик именно ВЫРОС (пришло новое
  // уведомление по фоновому опросу) — не при падении после прочтения.
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setIsRinging(true);
      const timer = setTimeout(() => setIsRinging(false), 500);
      prevCountRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const displayCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Уведомления"
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10",
          isOpen && "bg-white/10",
        )}
      >
        <Bell size={18} className={cn(isRinging && styles.bellRinging)} />
        {unreadCount > 0 && (
          <span
            key={unreadCount > 0 ? "has-unread" : "no-unread"}
            className={cn(
              "absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-semibold leading-none text-white",
              styles.badge,
            )}
          >
            {displayCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={cn(
            "fixed inset-x-3 top-[73px] z-50 sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-2",
            "overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]",
            "shadow-[0_8px_32px_var(--shadow-color)]",
            styles.panel,
          )}
        >
          <NotificationPanel onNavigate={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}
