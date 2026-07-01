import { cookies, headers } from "next/headers";
import { redirect }         from "next/navigation";
import { getPayload }       from "payload";
import config               from "@/payloadconfig";
import { getUserActiveSessions } from "@/modules/auth/lib/session";
import { ProfileClient }    from "@/modules/profile/components/ProfileClient";
import {
  updateAccountAction,
  changePasswordAction,
  revokeSessionAction,
  refreshSessionsAction,
  logoutAction,
} from "@/modules/profile/actions";
import type {
  ProfileUser,
  ProfileSession,
} from "@/modules/profile/types/profile.types";

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

  const h       = await headers();
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: h });
  if (!user) redirect("/auth/login");

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const currentSessionId = cookieStore.get("session-id")?.value;

  const rawSessions = await getUserActiveSessions(payload, String(user.id));
  const sessions: ProfileSession[] = rawSessions.map((s) => ({
    id:           String(s.id),
    deviceLabel:  (s.deviceLabel ?? "Устройство") as string,
    ip:           s.ip as string | undefined,
    createdAt:    s.createdAt as string,
    lastActiveAt: s.lastActiveAt as string,
    isCurrent:    String(s.id) === currentSessionId,
  }));

  const profileUser: ProfileUser = {
    id:            String(user.id),
    name:          user.name as string,
    email:         user.email as string,
    role:          user.role as string,
    status:        user.status as string,
    emailVerified: user.emailVerified as boolean | undefined,
    lastLoginAt:   user.lastLoginAt as string | undefined,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
         <main className="max-w-5xl mx-auto py-10 px-4">


      <ProfileClient
        user={profileUser}
        sessions={sessions}
        actions={{
          updateAccount:   updateAccountAction,
          changePassword:  changePasswordAction,
          revokeSession:   revokeSessionAction,
          refreshSessions: refreshSessionsAction,
          logout:          logoutAction,
        }}
      />
    </main>
  );
}