"use client";

import { useState } from "react";
import { ProfileTabs } from "./ProfileTabs";
import { AccountTab } from "./AccountTab";
import { SecurityTab } from "./SecurityTab";
import { SessionsTab } from "./SessionsTab";
import { LogoutConfirmModal } from "./LogoutConfirmModal";
import type {
  ProfileTab,
  ProfileUser,
  ProfileSession,
  ChangePasswordPayload,
  UpdateAccountPayload,
} from "../types/profile.types";
import { Block } from "@/UI/Block/Block";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProfileClientProps {
  user: ProfileUser;
  sessions: ProfileSession[];
  actions: {
    updateAccount: (payload: UpdateAccountPayload) => Promise<void>;
    changePassword: (payload: ChangePasswordPayload) => Promise<void>;
    revokeSession: (sessionId: string) => Promise<void>;
    refreshSessions: () => Promise<ProfileSession[]>;
    logout: () => Promise<void>;
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProfileClient({ user: initialUser, sessions: initialSessions, actions }: ProfileClientProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>("account");
  const [user, setUser] = useState<ProfileUser>(initialUser);
  const [sessions, setSessions] = useState<ProfileSession[]>(initialSessions);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleUpdateAccount(payload: UpdateAccountPayload) {
    await actions.updateAccount(payload);
    // Оптимистичное обновление локального состояния
    setUser((prev) => ({ ...prev, name: payload.name }));
  }

  async function handleRevokeSession(sessionId: string) {
    await actions.revokeSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  async function handleRefreshSessions() {
    const fresh = await actions.refreshSessions();
    setSessions(fresh);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <Block
        title="Настройки профиля"
        variant="elevated"
        size="xl"
        className="w-full"
      >
        <ProfileTabs active={activeTab} onChange={setActiveTab} />

        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === "account" && (
            <AccountTab
              key={user.id + user.email}
              user={user}
              onUpdate={handleUpdateAccount}
              onLogoutRequest={() => setLogoutOpen(true)}
            />
          )}

          {activeTab === "security" && (
            <SecurityTab onChangePassword={actions.changePassword} />
          )}

          {activeTab === "sessions" && (
            <SessionsTab
              sessions={sessions}
              onRevoke={handleRevokeSession}
              onRefresh={handleRefreshSessions}
            />
          )}
        </div>
      </Block>

      <LogoutConfirmModal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={actions.logout}
      />
    </>
  );
}