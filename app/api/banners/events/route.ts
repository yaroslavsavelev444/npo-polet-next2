import { type NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserFromHeaders } from "@/modules/auth/lib/getCurrentUser";
import { bannerEventSchema } from "@/modules/banners/schemas";
import { recordInteraction } from "@/modules/banners/server/events";
import type { BannerEventAck } from "@/modules/banners/types";

// Payload Local API требует Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/banners/events
 *
 * ─── Почему один маршрут на все события, а не пять ─────────────────────────
 *
 * Показ, чтение, нажатие и закрытие — это одна последовательность вокруг
 * одного `impressionId`, с одной проверкой принадлежности и одной защитой от
 * повтора. Пять маршрутов означали бы пять копий этой проверки, и первая же
 * разошедшаяся копия — это либо дыра, либо событие, которое молча не
 * записывается.
 *
 * ─── Что здесь происходит помимо записи ────────────────────────────────────
 *
 *  * `impression` СПРАШИВАЕТ РАЗРЕШЕНИЯ, а не сообщает о факте. Сервер заново
 *    проверяет, жив ли баннер и положен ли он этому человеку, и вправе
 *    ответить «нет» — тогда браузер выбрасывает баннер, не показывая. Это и
 *    есть защита от показа отключённого, удалённого или ещё не проверенного
 *    баннера, и она стоит здесь, а не на клиенте, потому что клиент — та
 *    сторона, от которой защищаются.
 *
 *    Она же заменяет собой отзыв баннера, который в исходной системе рассылался
 *    по сокету: без сокета «убрать с экрана то, что ещё не показано» делается
 *    не командой сверху, а отказом в ответ на вопрос — и это не обходной путь,
 *    а та самая гарантия, которой отзыв и не был (он «мог не дойти», и ни одна
 *    проверка на него не полагалась).
 *
 *  * `dismiss` освобождает очередь. Следующий баннер клиент попросит сам —
 *    закрытие модалки и есть повод спросить.
 */
export async function POST(
	req: NextRequest,
): Promise<NextResponse<BannerEventAck | { error: string }>> {
	// Единая проверка личности (валидный токен + активный статус аккаунта):
	// payload.auth() сам по себе пропускает заблокированного администратором
	// пользователя, пока его JWT не истёк.
	const user = await getAuthenticatedUserFromHeaders(req.headers);
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = bannerEventSchema.safeParse(
		await req.json().catch(() => null),
	);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Некорректное тело запроса" },
			{ status: 400 },
		);
	}

	try {
		const result = await recordInteraction({
			userId: user.id,
			interaction: parsed.data,
		});

		// Показ не найден или принадлежит другому пользователю. Ответ тот же, что
		// и у снятого с публикации баннера: различать их — значит сообщать
		// владельцу подобранного идентификатора, что такой показ существует.
		if (!result) {
			return NextResponse.json({
				accepted: false,
				allowed: false,
				revoked: true,
				outcome: false,
			});
		}

		return NextResponse.json(result);
	} catch (error) {
		console.error("[api/banners/events] Unexpected error:", error);
		return NextResponse.json(
			{ error: "Не удалось записать событие баннера" },
			{ status: 500 },
		);
	}
}
