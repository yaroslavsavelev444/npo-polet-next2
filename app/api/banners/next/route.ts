import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserFromHeaders } from "@/modules/auth/lib/getCurrentUser";
import { nextBannerQuerySchema } from "@/modules/banners/schemas";
import { deliverNextBanner } from "@/modules/banners/server/delivery";
import type { NextBannerResponse } from "@/modules/banners/types";

// Payload Local API требует Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/banners/next?path=<текущий адрес вкладки>
 *
 * ─── Это не опрос ──────────────────────────────────────────────────────────
 *
 * Регулярных запросов «есть ли для меня баннер» здесь нет и быть не должно.
 * Маршрут вызывается по поводам, а не по таймеру: при монтировании
 * вкладки-ведущего, после закрытия очередной модалки и при возврате фокуса на
 * вкладку. Если сервер ответил «пока нет» и назвал момент (`retryAt`) — ставится
 * ОДИН таймер ровно на этот момент, а не интервал.
 *
 * Этим маршрут отличается от `/api/notifications/unread-count`, который
 * действительно опрашивается раз в минуту, и отличается обоснованно: там
 * дешёвый `COUNT(*)`, здесь — сбор фактов о пользователе и проход по всем живым
 * баннерам. Раз в минуту на каждого посетителя это была бы заметная нагрузка
 * ради события, которое случается несколько раз в жизни аккаунта.
 *
 * ─── Почему баннер выдаётся ЗАПРОСОМ, а не приходит сам ────────────────────
 *
 * В исходной системе баннеры рассылал сокет, и HTTP-маршрут был там резервным
 * путём на случай, когда realtime не настроен. В Полёте сокета нет вовсе, и
 * этот путь стал единственным. Поведение от этого не пострадало: момент показа
 * всё равно выбирал клиент (экранное время, нужная страница), а сервер всё
 * равно оставался единственным, кто решает, что показывать. Изменилось только
 * то, КТО ЗАДАЁТ ВОПРОС.
 */
export async function GET(
	req: NextRequest,
): Promise<NextResponse<NextBannerResponse | { error: string }>> {
	// Единая проверка личности (валидный токен + активный статус аккаунта):
	// payload.auth() сам по себе пропускает заблокированного администратором
	// пользователя, пока его JWT не истёк.
	const user = await getAuthenticatedUserFromHeaders(req.headers);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Некорректный путь — не ошибка запроса, а отсутствие сведений о странице:
	// баннеры без условия `page` выдаются как обычно, баннеры с ним подождут
	// следующего запроса. Отвечать 400 значило бы лишить человека всех баннеров
	// из-за одного странного адреса.
	const parsed = nextBannerQuerySchema.safeParse({
		path: req.nextUrl.searchParams.get("path") ?? undefined,
	});
	const path = parsed.success ? parsed.data.path : undefined;

	try {
		const outcome = await deliverNextBanner({
			userId: user.id,
			context: path ? { path } : null,
		});

		return NextResponse.json({
			banner: outcome.banner,
			impressionId: outcome.impressionId,
			// Клиенту незачем знать, что именно его остановило — пауза, суточный
			// предел или пустая очередь. Ему нужен один ответ: когда спросить
			// снова и спрашивать ли вообще.
			retryAt: outcome.retryAt,
			pageBlocked: outcome.pageBlocked,
		});
	} catch (error) {
		console.error("[api/banners/next] Unexpected error:", error);
		return NextResponse.json(
			{ error: "Не удалось получить баннер" },
			{ status: 500 },
		);
	}
}
