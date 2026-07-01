"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { SessionCard } from "./SessionCard";
import type { ProfileSession } from "../types/profile.types";
import { Block, Button, Empty, Spinner } from "@/UI";


interface SessionsTabProps {
  sessions: ProfileSession[];
  /** Called when user revokes a session; parent should re-fetch and pass new sessions */
  onRevoke:  (sessionId: string) => Promise<void>;
  /** Called to re-fetch the sessions list */
  onRefresh: () => Promise<void>;
}

export function SessionsTab({ sessions, onRevoke, onRefresh }: SessionsTabProps) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await onRevoke(id);
    } finally {
      setRevokingId(null);
    }
  }

  function handleRefresh() {
    startRefresh(async () => {
      await onRefresh();
    });
  }

  const currentSession  = sessions.find((s) => s.isCurrent);
  const otherSessions   = sessions.filter((s) => !s.isCurrent);

  return (
    <Block variant="ghost" noPadding>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-base font-semibold text-[var(--text-primary)]">
            Активные устройства
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {sessions.length > 0
              ? `${sessions.length} ${pluralSessions(sessions.length)}`
              : "Нет активных сессий"}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          leftIcon={
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          }
        >
          Обновить
        </Button>
      </div>

      {isRefreshing && sessions.length === 0 ? (
        <div className="flex justify-center py-12">
          <Spinner size="md" label="Загрузка сессий..." />
        </div>
      ) : sessions.length === 0 ? (
        <Empty
          size="md"
          message="Нет активных сессий"
          description="Как только вы войдёте с другого устройства, оно появится здесь"
          className="py-10"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Current session first */}
          {currentSession && (
            <SessionCard
              key={currentSession.id}
              session={currentSession}
            />
          )}

          {/* Other sessions */}
          {otherSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onRevoke={handleRevoke}
              revoking={revokingId === session.id}
            />
          ))}
        </div>
      )}
    </Block>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pluralSessions(n: number): string {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "сессия";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "сессии";
  return "сессий";
}