import type { NextRequest } from "next/server";
import {
	errorResponse,
	json,
	requireCustomer,
	supportDeps,
} from "@/modules/support-chat/server/http";
import { openCustomerConversation } from "@/modules/support-chat/server/support.service";

// Payload Local API требует Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/conversation
 *
 * Что показать в виджете чата до подключения сокета: текущий диалог
 * покупателя (открытый, иначе последний закрытый — ради истории и оценки),
 * последняя страница сообщений, оценка времени ответа и приветствие. То же,
 * что событие шлюза `conversation:open`, — для первого рендера и для
 * клиентов, у которых сокет не поднялся.
 */
export async function GET(request: NextRequest) {
	try {
		const actor = await requireCustomer(request);
		return json(await openCustomerConversation(await supportDeps(), actor));
	} catch (error) {
		return errorResponse(error, "/api/support/conversation");
	}
}
