"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { revokePayloadSession } from "../lib/payloadSessions";
import { revokeAllUserSessions, revokeSession } from "../lib/session";

/**
 * Server Action: выход из текущей сессии.
 * Отзывает сессию + удаляет cookies.
 */
export async function logoutAction() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session-id")?.value;

  try {
    const payload = await getPayloadInstance();

    // Снять сам токен с валидности обязательно и в том случае, когда
    // session-id нет (или он не совпадает с токеном): иначе «выход» удалял бы
    // только cookies, а сохранённый payload-token работал бы ещё 7 суток.
    // user._sid Payload проставляет после проверки подписи JWT — это
    // единственный достоверный идентификатор сессии текущего запроса.
    const { user } = await payload.auth({ headers: await headers() });
    const sid = (user as { _sid?: string } | null)?._sid;
    if (user && sid) {
      await revokePayloadSession(payload, user.id, sid);
    }

    if (sessionId) {
      await revokeSession(payload, sessionId, "logout");
    }
  } catch {
    // Продолжаем logout даже если БД недоступна
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
      // См. verifyOtp.ts: нужны реальные заголовки запроса, иначе Payload's
      // cookie-CSRF проверка молча отклоняет валидный токен.
      const { user } = await payload.auth({ headers: await headers() });

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
  // См. verifyOtp.ts: нужны реальные заголовки запроса, иначе Payload's
  // cookie-CSRF проверка молча отклоняет валидный токен.
  const { user } = await payload.auth({ headers: await headers() });

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
