import type { NextRequest } from "next/server";
import { z } from "zod";
import { SupportError } from "@/modules/support-chat/server/errors";
import {
	assertSameSite,
	errorResponse,
	json,
	positiveInt,
	requireStaff,
} from "@/modules/support-chat/server/http";
import { getPayloadInstance } from "@/payload/services/getPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ banned: z.boolean() });

/**
 * POST /api/support/staff/customers/:id/chat-ban { banned } — запретить или
 * разрешить покупателю писать в чат. Остальной аккаунт не затрагивается.
 *
 * Через Local API, а не SQL: хук коллекции users разрывает открытые сокеты
 * покупателя (server/kick.ts), и изменение видно в истории документа.
 */
export async function POST(
	request: NextRequest,
	ctx: { params: Promise<{ id: string }> },
) {
	try {
		assertSameSite(request);
		const actor = await requireStaff(request);
		const userId = positiveInt((await ctx.params).id);
		if (!userId) throw new SupportError("not_found", "Покупатель не найден");

		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success)
			throw new SupportError("invalid", "Ожидается { banned: boolean }");

		const payload = await getPayloadInstance();
		try {
			await payload.update({
				collection: "users",
				id: userId,
				data: { supportChatBanned: parsed.data.banned },
				overrideAccess: true,
			});
		} catch {
			throw new SupportError("not_found", "Покупатель не найден");
		}
		payload.logger.info(
			{ adminId: actor.adminId, userId, banned: parsed.data.banned },
			"[support-chat] запрет писать в чат изменён",
		);
		return json({ banned: parsed.data.banned });
	} catch (error) {
		return errorResponse(error, "/api/support/staff/customers/[id]/chat-ban");
	}
}
