import type { NextRequest } from "next/server";
import { SupportError } from "@/modules/support-chat/server/errors";
import {
	errorResponse,
	json,
	positiveInt,
	requireActor,
	supportDeps,
} from "@/modules/support-chat/server/http";
import {
	loadHistory,
	syncMessages,
} from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/conversations/:id/messages?beforeSeq=N — страница старше N;
 * GET /api/support/conversations/:id/messages?afterSeq=N  — всё новее N.
 *
 * Покупателю — его диалоги без внутренних заметок, менеджеру — любые.
 * Права и аудиторию решает сервис по участнику.
 */
export async function GET(
	request: NextRequest,
	// Тип параметров — явно, а не RouteContext: тот генерирует `next dev` /
	// `next typegen`, а type-check в CI идёт на чистом checkout без .next.
	ctx: { params: Promise<{ id: string }> },
) {
	try {
		const actor = await requireActor(request);
		const conversationId = positiveInt((await ctx.params).id);
		if (!conversationId)
			throw new SupportError("not_found", "Диалог не найден");

		const params = request.nextUrl.searchParams;
		const deps = await supportDeps();
		const afterRaw = params.get("afterSeq");
		if (afterRaw !== null) {
			const afterSeq = afterRaw === "0" ? 0 : positiveInt(afterRaw);
			if (afterSeq === null)
				throw new SupportError("invalid", "Неверный afterSeq");
			return json(
				await syncMessages(deps, actor, { conversationId, afterSeq }),
			);
		}
		const beforeSeq = positiveInt(params.get("beforeSeq"));
		if (!beforeSeq)
			throw new SupportError("invalid", "Нужен beforeSeq или afterSeq");
		return json(await loadHistory(deps, actor, { conversationId, beforeSeq }));
	} catch (error) {
		return errorResponse(error, "/api/support/conversations/[id]/messages");
	}
}
