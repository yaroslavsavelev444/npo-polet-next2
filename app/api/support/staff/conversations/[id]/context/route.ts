import type { NextRequest } from "next/server";
import { SupportError } from "@/modules/support-chat/server/errors";
import {
	errorResponse,
	json,
	positiveInt,
	requireStaff,
	supportDeps,
} from "@/modules/support-chat/server/http";
import { customerContextForStaff } from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/staff/conversations/:id/context — покупатель рядом с
 * перепиской: профиль, организации, заказы, корзина, прошлые диалоги.
 */
export async function GET(
	request: NextRequest,
	ctx: { params: Promise<{ id: string }> },
) {
	try {
		const actor = await requireStaff(request);
		const conversationId = positiveInt((await ctx.params).id);
		if (!conversationId)
			throw new SupportError("not_found", "Диалог не найден");
		return json({
			context: await customerContextForStaff(
				await supportDeps(),
				actor,
				conversationId,
			),
		});
	} catch (error) {
		return errorResponse(
			error,
			"/api/support/staff/conversations/[id]/context",
		);
	}
}
