"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { revokeAllUserSessions, revokeSession } from "../lib/session";

/**
 * Server Action: выход из текущей сессии.
 * Отзывает сессию + удаляет cookies.
 */
export async function logoutAction() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session-id")?.value;
  const payloadToken = cookieStore.get("payload-token");

  if (sessionId) {
    try {
      const payload = await getPayloadInstance();
      await revokeSession(payload, sessionId, "logout");
    } catch {
      // Продолжаем logout даже если БД недоступна
    }
  }

  // Удаляем обе cookies
  cookieStore.delete("payload-token");
  cookieStore.delete("session-id");

  redirect("/auth/login");
}

/**
 * Server Action: выход со всех устройств.
 * Отзывает все активные сессии пользователя.
 */
export async function logoutAllAction() {
  const cookieStore = await cookies();
  const payloadToken = cookieStore.get("payload-token");

  if (payloadToken) {
    try {
      const payload = await getPayloadInstance();
      const { user } = await payload.auth({
        headers: new Headers({ cookie: `payload-token=${payloadToken.value}` }),
      });

      if (user) {
        await revokeAllUserSessions(payload, String(user.id), "logout_all");
      }
    } catch {
      // Продолжаем
    }
  }

  cookieStore.delete("payload-token");
  cookieStore.delete("session-id");

  redirect("/auth/login");
}

/**
 * Server Action: отозвать конкретную чужую сессию.
 * Используется в профиле «Активные устройства».
 */
export async function revokeSessionAction(
  _prevState: unknown,
  formData: FormData,
) {
  const targetSessionId = formData.get("sessionId");
  if (!targetSessionId || typeof targetSessionId !== "string") {
    return { success: false, error: "ID сессии не указан" };
  }

  const cookieStore = await cookies();
  const payloadToken = cookieStore.get("payload-token");
  if (!payloadToken) {
    return { success: false, error: "Не авторизован" };
  }

  const payload = await getPayloadInstance();
  const { user } = await payload.auth({
    headers: new Headers({ cookie: `payload-token=${payloadToken.value}` }),
  });

  if (!user) {
    return { success: false, error: "Сессия истекла" };
  }

  // Проверяем что сессия принадлежит текущему пользователю
  const session = await payload.findByID({
    collection: "sessions",
    id: targetSessionId,
    overrideAccess: true,
  });

  const sessionUserId =
    typeof session?.user === "object" ? session.user.id : session?.user;

  if (!session || String(sessionUserId) !== String(user.id)) {
    return { success: false, error: "Сессия не найдена" };
  }

  await revokeSession(payload, targetSessionId, "logout");

  return { success: true, data: { message: "Сессия завершена" } };
}
