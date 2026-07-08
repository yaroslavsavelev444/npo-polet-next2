import { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserActiveSessions } from "@/modules/auth/lib/session";
import { isUser } from "@/modules/auth/lib/typeGuards";
import {
  changePasswordAction,
  logoutAction,
  refreshSessionsAction,
  revokeSessionAction,
  updateAccountAction,
} from "@/modules/profile/actions";
import { ProfileClient } from "@/modules/profile/components/ProfileClient";
import type {
  ProfileSession,
  ProfileUser,
} from "@/modules/profile/types/profile.types";
import { getPayloadInstance } from "@/payload/services/getPayload";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Профиль",
  robots: { index: false, follow: false },
};
/**
 * /profile — Server Component.
 *
 * Fetches user + sessions via Payload Local API (no HTTP round-trip),
 * then hands off to ProfileClient for all interactivity.
 * Server Actions are passed as props so they can be replaced with stubs in tests.
 */
export default async function ProfilePage() {
  // ─── Auth guard ─────────────────────────────────────────────────────────────

  const cookieStore = await cookies();
  if (!cookieStore.get("payload-token")) redirect("/auth/login");

  const h = await headers();
  const payload = await getPayloadInstance();
  const { user } = await payload.auth({ headers: h });
  if (!user || !isUser(user)) redirect("/auth/login");

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const currentSessionId = cookieStore.get("session-id")?.value;

  const rawSessions = await getUserActiveSessions(payload, String(user.id));
  const sessions: ProfileSession[] = rawSessions.map((s) => ({
    id: String(s.id),
    deviceLabel: (s.deviceLabel ?? "Устройство") as string,
    ip: s.ip as string | undefined,
    createdAt: s.createdAt as string,
    lastActiveAt: s.lastActiveAt as string,
    isCurrent: String(s.id) === currentSessionId,
  }));

  const profileUser: ProfileUser = {
    id: String(user.id),
    name: user.name as string,
    email: user.email as string,
    role: user.role as string,
    status: user.status as string,
    emailVerified: user.emailVerified as boolean | undefined,
    lastLoginAt: user.lastLoginAt as string | undefined,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="max-w-5xl mx-auto py-10 px-4">
      <ProfileClient
        user={profileUser}
        sessions={sessions}
        actions={{
          updateAccount: updateAccountAction,
          changePassword: changePasswordAction,
          revokeSession: revokeSessionAction,
          refreshSessions: refreshSessionsAction,
          logout: logoutAction,
        }}
      />
    </main>
  );
}
