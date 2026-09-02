import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserFromHeaders } from "@/modules/auth/lib/getCurrentUser";
import { getUnreadNotificationCount } from "@/payload/services/notifications.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/unread-count
 *
 * Лёгкий эндпоинт для бейджа колокольчика — опрашивается периодически и
 * при возврате фокуса на вкладку (см. useUnreadCount), не тянет сами
 * уведомления. После открытия дропдауна счётчик обновляется из ответа
 * GET /api/notifications напрямую (см. его комментарий), этот эндпоинт
 * нужен для фонового обновления бейджа, пока дропдаун ни разу не открыт.
 */
export async function GET(
	req: NextRequest,
): Promise<NextResponse<{ count: number } | { error: string }>> {
	// Единая проверка личности (валидный токен + активный статус аккаунта):
	// payload.auth() сам по себе пропускает заблокированного администратором
	// пользователя, пока его JWT не истёк.
	const user = await getAuthenticatedUserFromHeaders(req.headers);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const count = await getUnreadNotificationCount(user.id);
		return NextResponse.json({ count });
	} catch (error) {
		console.error("[api/notifications/unread-count] Unexpected error:", error);
		return NextResponse.json(
			{ error: "Не удалось получить счётчик уведомлений" },
			{ status: 500 },
		);
	}
}
