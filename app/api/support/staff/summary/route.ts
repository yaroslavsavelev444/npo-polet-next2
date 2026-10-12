import type { NextRequest } from "next/server";
import {
	errorResponse,
	json,
	requireStaff,
	supportDeps,
} from "@/modules/support-chat/server/http";
import { staffSummary } from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/staff/summary — счётчики для пункта «Чат поддержки» в
 * меню админки. Опросом, без сокета: меню есть на каждой странице админки, а
 * «на месте» менеджер считается только с открытой консолью.
 */
export async function GET(request: NextRequest) {
	try {
		const actor = await requireStaff(request);
		return json(await staffSummary(await supportDeps(), actor));
	} catch (error) {
		return errorResponse(error, "/api/support/staff/summary");
	}
}
