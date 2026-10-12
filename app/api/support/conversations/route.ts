import type { NextRequest } from "next/server";
import {
	errorResponse,
	json,
	requireCustomer,
	supportDeps,
} from "@/modules/support-chat/server/http";
import { listCustomerConversations } from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/support/conversations — история диалогов покупателя (страница в профиле). */
export async function GET(request: NextRequest) {
	try {
		const actor = await requireCustomer(request);
		return json({
			conversations: await listCustomerConversations(
				await supportDeps(),
				actor,
			),
		});
	} catch (error) {
		return errorResponse(error, "/api/support/conversations");
	}
}
