import type { NextRequest } from "next/server";
import { SupportError } from "@/modules/support-chat/server/errors";
import {
	assertSameSite,
	errorResponse,
	json,
	positiveInt,
	requireCustomer,
	supportDeps,
} from "@/modules/support-chat/server/http";
import { markRead } from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/support/conversations/:id/read { seq } — «прочитано до seq».
 * Для «Моих обращений»: там переписка открывается без сокета, а отметка
 * «Новый ответ» и счётчик на кнопке чата должны сняться так же, как при
 * чтении в окне чата.
 */
export async function POST(
	request: NextRequest,
	ctx: { params: Promise<{ id: string }> },
) {
	try {
		assertSameSite(request);
		const actor = await requireCustomer(request);
		const conversationId = positiveInt((await ctx.params).id);
		if (!conversationId)
			throw new SupportError("not_found", "Диалог не найден");
		const body = (await request.json().catch(() => null)) as {
			seq?: unknown;
		} | null;
		const seq = typeof body?.seq === "number" ? body.seq : null;
		if (seq === null || !Number.isInteger(seq) || seq < 0)
			throw new SupportError("invalid", "Неверный seq");
		return json(
			await markRead(await supportDeps(), actor, { conversationId, seq }),
		);
	} catch (error) {
		return errorResponse(error, "/api/support/conversations/[id]/read");
	}
}
