"use client";

import { User, ShieldCheck, Monitor } from "lucide-react";
import type { ProfileTab } from "../types/profile.types";
import { cn } from "@/utils/cn";

interface Tab {
  key: ProfileTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { key: "account",  label: "Аккаунт",           icon: <User className="w-4 h-4" /> },
  { key: "security", label: "Безопасность",       icon: <ShieldCheck className="w-4 h-4" /> },
  { key: "sessions", label: "Активные сессии",    icon: <Monitor className="w-4 h-4" /> },
];

interface ProfileTabsProps {
  active: ProfileTab;
  onChange: (tab: ProfileTab) => void;
}

export function ProfileTabs({ active, onChange }: ProfileTabsProps) {
  return (
    <nav
      role="tablist"
      aria-label="Разделы профиля"
      className="flex gap-1 border-b border-[var(--border)] mb-6"
    >
      {TABS.map(({ key, label, icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`tabpanel-${key}`}
            id={`tab-${key}`}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium",
              "border-b-2 -mb-px transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2",
              isActive
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-light)]",
            )}
          >
            <span aria-hidden>{icon}</span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}