"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revokePayloadSession } from "@/modules/auth/lib/payloadSessions";
import {
  getUserActiveSessions,
  invalidateSession,
  revokeAllUserSessions,
} from "@/modules/auth/lib/session";
import { AUTH_FLOW_CONTEXT } from "@/payload/hooks/users/requireServerAuthFlow";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notify } from "@/services/notifications/notificationCenter";
import { notifyPasswordChanged } from "@/services/notifications/notifyPasswordChanged";
import {
  ChangePasswordPayload,
  ProfileSession,
  UpdateAccountPayload,
} from "./types/profile.types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Личность выполняющего действие. getCurrentUser (а не payload.auth напрямую)
 * — потому что он дополнительно сужает результат до покупателя и отсекает
 * заблокированный/приостановленный аккаунт: payload.auth() вернул бы и
 * аккаунт персонала (у коллекций `admins` и `users` независимая нумерация id,
 * и подставлять такой id в payload.update по коллекции `users` нельзя), и
 * пользователя, которого администратор уже заблокировал.
 */
async function getAuthedUser() {
  const payload = await getPayloadInstance();
  const user = await getCurrentUser();
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
  void notify(payload, user.id, "profile_updated", {});

  revalidatePath("/profile");
}

export async function changePasswordAction(
  data: ChangePasswordPayload,
): Promise<void> {
  const cookieStore = await cookies();
  const { payload, user } = await getAuthedUser();

  // Payload requires re-login to verify old password; use the login endpoint.
  // AUTH_FLOW_CONTEXT — см. requireServerAuthFlow.ts. Здесь это не выдача
  // сессии, а сверка старого пароля: токен из результата не используется и
  // браузеру не отдаётся, пользователь уже авторизован (payload.auth выше).
  const loginResult = await payload.login({
    collection: "users",
    data: { email: user.email as string, password: data.oldPassword },
    context: AUTH_FLOW_CONTEXT,
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

  // Смена пароля = выход со всех ОСТАЛЬНЫХ устройств. Текущую сессию
  // оставляем активной (пользователь только что подтвердил старый пароль),
  // остальные отзываем — если аккаунт был скомпрометирован, украденная
  // сессия/устройство теряет доступ на следующем же переходе по защищённому
  // пути (proxy.ts чистит куки при отозванной сессии). Раньше этого не было:
  // resetPasswordAction отзывал все сессии, а смена пароля из профиля — нет.
  const currentSessionId = cookieStore.get("session-id")?.value;
  await revokeAllUserSessions(
    payload,
    String(user.id),
    "password_changed",
    currentSessionId,
  );

  await notifyPasswordChanged({
    email: user.email as string,
    userName: user.name as string,
  });
  void notify(payload, user.id, "password_changed", {});

  revalidatePath("/profile");
}

export async function revokeSessionAction(sessionId: string): Promise<void> {
  const { payload, user } = await getAuthedUser();
  const ok = await invalidateSession(payload, sessionId, String(user.id));
  if (!ok) {
    throw new Error("Не удалось завершить сессию");
  }
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

  // Сам токен снимаем с валидности всегда — в том числе когда cookie
  // session-id отсутствует: иначе выход удалил бы только cookies, а
  // сохранённый payload-token работал бы до конца своих 7 суток
  // (см. payloadSessions.ts).
  const sid = (user as { _sid?: string })._sid;
  if (sid) {
    await revokePayloadSession(payload, user.id, sid);
  }

  if (sessionId) {
    await invalidateSession(payload, sessionId, String(user.id));
  }

  // Remove auth cookies
  cookieStore.delete("payload-token");
  cookieStore.delete("session-id");

  redirect("/auth/login");
}
