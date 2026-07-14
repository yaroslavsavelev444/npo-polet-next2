import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getUnreadNotificationCount,
  markAllNotificationsReadForUser,
  markNotificationsReadForUser,
} from "@/payload/services/notifications.service";
import { getPayloadInstance } from "@/payload/services/getPayload";
import type { MarkReadResponse } from "@/modules/notifications/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ ids: z.array(z.union([z.number(), z.string()])).min(1) }),
]);

/**
 * POST /api/notifications/mark-read
 * Body: { all: true } | { ids: (number|string)[] }
 *
 * Основной путь прочтения — побочный эффект GET /api/notifications (см. её
 * комментарий): открыл дропдаун → показанное отмечено прочитанным. Этот
 * эндпоинт — для явного действия пользователя «Прочитать всё», которое
 * должно закрыть и то, что ещё не подгружалось в дропдаун.
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<MarkReadResponse | { error: string }>> {
  const payload = await getPayloadInstance();

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  try {
    const updated =
      "all" in parsed.data
        ? await markAllNotificationsReadForUser(user.id)
        : await markNotificationsReadForUser(user.id, parsed.data.ids);

    const unreadCount = await getUnreadNotificationCount(user.id);

    return NextResponse.json({ updated, unreadCount });
  } catch (error) {
    console.error("[api/notifications/mark-read] Unexpected error:", error);
    return NextResponse.json(
      { error: "Не удалось отметить уведомления прочитанными" },
      { status: 500 },
    );
  }
}
