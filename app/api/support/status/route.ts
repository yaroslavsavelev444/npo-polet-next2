import { NextResponse } from "next/server";
import { errorResponse, supportDeps } from "@/modules/support-chat/server/http";
import { getEta } from "@/modules/support-chat/server/support.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/support/status — рабочее ли сейчас время и через сколько примерно
 * ответят. Одинаково для всех и ничего личного не содержит, поэтому
 * кэшируется на полминуты: кнопка чата на каждой странице не должна каждый
 * раз ходить в базу и Redis.
 */
export async function GET() {
	try {
		const eta = await getEta(await supportDeps());
		return NextResponse.json(eta, {
			headers: {
				"Cache-Control": "public, max-age=30, stale-while-revalidate=60",
				"X-Robots-Tag": "noindex, nofollow",
			},
		});
	} catch (error) {
		return errorResponse(error, "/api/support/status");
	}
}
