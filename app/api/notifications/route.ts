import { NextRequest, NextResponse } from "next/server";
import {
  getUnreadNotificationCount,
  listNotificationsPage,
  markNotificationsReadForUser,
} from "@/payload/services/notifications.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import type {
  NotificationDTO,
  NotificationsPageResponse,
} from "@/modules/notifications/types";
import type { Notification } from "../../../payload-types";

// Payload Local API требует Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;

function toDTO(doc: Notification): NotificationDTO {
  return {
    id: doc.id,
    type: (doc.type ?? "system") as NotificationDTO["type"],
    title: doc.title,
    body: doc.body,
    link: doc.link ?? null,
    isRead: Boolean(doc.isRead),
    createdAt: doc.createdAt,
  };
}

/**
 * GET /api/notifications?cursor=<page>&limit=<n>
 *
 * Возвращает страницу уведомлений пользователя, отсортированную по
 * createdAt desc, и ПОПУТНО помечает прочитанными те из них, что были
 * непрочитаны — ровно то, что попало в этот ответ, было только что
 * показано пользователю в открытом дропдауне (см. требование "при
 * открытии меню уведомления должны помечаться прочитанными"). Это касается
 * КАЖДОЙ подгружаемой страницы, не только первой — увиденное при
 * infinite-scroll уведомление тоже подтверждено просмотренным.
 */
export async function GET(
  req: NextRequest,
): Promise<NextResponse<NotificationsPageResponse | { error: string }>> {
  const payload = await getPayloadInstance();

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cursor = Number(req.nextUrl.searchParams.get("cursor") ?? "1");
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? String(DEFAULT_LIMIT));
  const page = Number.isFinite(cursor) && cursor > 0 ? Math.floor(cursor) : 1;
  const limit = Math.min(
    MAX_LIMIT,
    Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : DEFAULT_LIMIT,
  );

  try {
    const { docs, hasNextPage, nextPage, totalDocs } = await listNotificationsPage(
      user.id,
      { page, limit },
    );

    const unreadIds = docs.filter((n) => !n.isRead).map((n) => n.id);
    if (unreadIds.length > 0) {
      await markNotificationsReadForUser(user.id, unreadIds);
    }

    // Свежий счётчик — после обработки этой страницы, чтобы клиент мог
    // сразу обновить бейдж без отдельного запроса к unread-count.
    const unreadCount = await getUnreadNotificationCount(user.id);

    return NextResponse.json({
      // isRead: true для всех — страница только что обработана выше,
      // показанное пользователю уведомление считается прочитанным целиком,
      // без промежуточного "только что прочитано" состояния в UI.
      items: docs.map((doc) => ({ ...toDTO(doc), isRead: true })),
      nextCursor: hasNextPage ? nextPage : null,
      totalDocs,
      unreadCount,
    });
  } catch (error) {
    console.error("[api/notifications] Unexpected error:", error);
    return NextResponse.json(
      { error: "Не удалось загрузить уведомления" },
      { status: 500 },
    );
  }
}
