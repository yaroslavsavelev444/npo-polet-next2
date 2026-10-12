import type { NextRequest } from "next/server";
import {
	errorResponse,
	json,
	positiveInt,
	requireStaff,
	supportDeps,
} from "@/modules/support-chat/server/http";
import {
	buildSupportReport,
	REPORT_DAYS,
} from "@/modules/support-chat/server/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/staff/reports?days=30 — отчёт за период (7/30/90/365 дней).
 * Только цифры: текст переписки в отчёт не попадает.
 */
export async function GET(request: NextRequest) {
	try {
		await requireStaff(request);
		const asked = positiveInt(request.nextUrl.searchParams.get("days"));
		const days = REPORT_DAYS.find((d) => d === asked) ?? 30;
		const { payload } = await supportDeps();
		return json(await buildSupportReport(payload, days));
	} catch (error) {
		return errorResponse(error, "/api/support/staff/reports");
	}
}
