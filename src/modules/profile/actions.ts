"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getUserActiveSessions,
  invalidateSession,
} from "@/modules/auth/lib/session";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyPasswordChanged } from "@/services/notifications/notifyPasswordChanged";
import {
  ChangePasswordPayload,
  ProfileSession,
  UpdateAccountPayload,
} from "./types/profile.types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthedUser() {
  const h = await headers();
  const payload = await getPayloadInstance();
  const { user } = await payload.auth({ headers: h });
  if (!user) redirect("/auth/login");
  return { payload, user };
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function updateAccountAction(
  payload_: UpdateAccountPayload,
): Promise<void> {
  const { payload, user } = await getAuthedUser();

  await payload.update({
    collection: "users",
    id: user.id,
    data: { name: payload_.name },
    overrideAccess: false,
    user,
  });

  revalidatePath("/profile");
}

export async function changePasswordAction(
  data: ChangePasswordPayload,
): Promise<void> {
  const h = await headers();
  const payload = await getPayloadInstance();

  // Payload's built-in login verifies the old password
  const { user } = await payload.auth({ headers: h });
  if (!user) redirect("/auth/login");

  // Payload requires re-login to verify old password; use the login endpoint
  const loginResult = await payload.login({
    collection: "users",
    data: { email: user.email as string, password: data.oldPassword },
  });

  if (!loginResult.user) {
    // Throw so the client useTransition catches it and can show a toast
    throw new Error("Неверный текущий пароль");
  }

  await payload.update({
    collection: "users",
    id: user.id,
    data: { password: data.newPassword },
    overrideAccess: false,
    user,
  });
  await notifyPasswordChanged({
    email: user.email as string,
    userName: user.name as string,
  });

  revalidatePath("/profile");
}

export async function revokeSessionAction(sessionId: string): Promise<void> {
  const { payload, user } = await getAuthedUser();
  await invalidateSession(payload, sessionId, String(user.id));
  revalidatePath("/profile");
}

export async function refreshSessionsAction(): Promise<ProfileSession[]> {
  const cookieStore = await cookies();
  const { payload, user } = await getAuthedUser();
  const currentSessionId = cookieStore.get("session-id")?.value;

  const raw = await getUserActiveSessions(payload, String(user.id));

  return raw.map((s) => ({
    id: String(s.id),
    deviceLabel: (s.deviceLabel ?? "Устройство") as string,
    ip: s.ip as string | undefined,
    createdAt: s.createdAt as string,
    lastActiveAt: s.lastActiveAt as string,
    isCurrent: String(s.id) === currentSessionId,
  }));
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session-id")?.value;
  const { payload, user } = await getAuthedUser();

  if (sessionId) {
    await invalidateSession(payload, sessionId, String(user.id));
  }

  // Remove auth cookies
  cookieStore.delete("payload-token");
  cookieStore.delete("session-id");

  redirect("/auth/login");
}
