import type { NextRequest } from "next/server";
import {
	errorResponse,
	json,
	requireStaff,
	supportDeps,
} from "@/modules/support-chat/server/http";
import { supportLive } from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/support/staff/live — очередь сейчас и кто на месте (опрос раз в 30 с). */
export async function GET(request: NextRequest) {
	try {
		await requireStaff(request);
		return json(await supportLive(await supportDeps()));
	} catch (error) {
		return errorResponse(error, "/api/support/staff/live");
	}
}
