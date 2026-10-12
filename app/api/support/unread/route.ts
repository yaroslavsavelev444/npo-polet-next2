import type { NextRequest } from "next/server";
import {
	errorResponse,
	json,
	resolveActor,
	supportDeps,
} from "@/modules/support-chat/server/http";
import { customerUnreadCount } from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/unread — сколько ответов менеджера покупатель ещё не
 * видел. Для значка на кнопке чата: опрашивается без сокета, поэтому гостю и
 * менеджеру отвечает нулём, а не ошибкой — значку нечего показывать.
 */
export async function GET(request: NextRequest) {
	try {
		const actor = await resolveActor(request);
		if (actor?.kind !== "customer") return json({ unread: 0 });
		return json({
			unread: await customerUnreadCount(await supportDeps(), actor),
		});
	} catch (error) {
		return errorResponse(error, "/api/support/unread");
	}
}
