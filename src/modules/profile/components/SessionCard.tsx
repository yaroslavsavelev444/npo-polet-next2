import { Monitor, Smartphone, Tablet, MapPin, Clock } from "lucide-react";
import type { ProfileSession } from "../types/profile.types";
import { cn } from "@/utils/cn";
import { Badge, Button } from "@/UI";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function DeviceIcon({ label, className }: { label: string; className?: string }) {
  const lower = label.toLowerCase();
  if (lower.includes("mobile") || lower.includes("phone") || lower.includes("android") || lower.includes("iphone")) {
    return <Smartphone className={className} aria-hidden />;
  }
  if (lower.includes("tablet") || lower.includes("ipad")) {
    return <Tablet className={className} aria-hidden />;
  }
  return <Monitor className={className} aria-hidden />;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SessionCardProps {
  session: ProfileSession;
  onRevoke?: (id: string) => void;
  revoking?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SessionCard({ session, onRevoke, revoking }: SessionCardProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-[var(--radius-md)]",
        "border border-[var(--border)] bg-[var(--surface)]",
        "transition-colors duration-150",
        session.isCurrent && "border-[var(--primary)]/40 bg-[var(--primary)]/5",
      )}
    >
      {/* Device icon */}
      <div
        className={cn(
          "flex-shrink-0 flex items-center justify-center",
          "w-10 h-10 rounded-[var(--radius-sm)]",
          "bg-[var(--surface-secondary)] text-[var(--text-secondary)]",
        )}
      >
        <DeviceIcon label={session.deviceLabel} className="w-5 h-5" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[var(--text-primary)] truncate">
            {session.deviceLabel}
          </span>
          {session.isCurrent && (
            <Badge variant="primary" dot>
              Текущая сессия
            </Badge>
          )}
        </div>

        <dl className="mt-1.5 flex flex-col gap-0.5">
          {session.ip && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <MapPin className="w-3 h-3 shrink-0" aria-hidden />
              <dt className="sr-only">IP-адрес</dt>
              <dd>{session.ip}</dd>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Clock className="w-3 h-3 shrink-0" aria-hidden />
            <dt className="sr-only">Последняя активность</dt>
            <dd>Активна: {formatDate(session.lastActiveAt)}</dd>
          </div>
        </dl>
      </div>

      {/* Revoke action */}
      {!session.isCurrent && onRevoke && (
        <Button
          variant="ghost"
          size="sm"
          disabled={revoking}
          loading={revoking}
          onClick={() => onRevoke(session.id)}
          className="text-[var(--error)] hover:bg-[var(--error)]/10 shrink-0"
        >
          Завершить
        </Button>
      )}
    </div>
  );
}