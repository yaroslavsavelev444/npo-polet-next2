import type { NextRequest } from "next/server";
import { readAttachment } from "@/modules/support-chat/server/attachments";
import { SupportError } from "@/modules/support-chat/server/errors";
import {
	errorResponse,
	positiveInt,
	requireActor,
} from "@/modules/support-chat/server/http";
import { getPayloadInstance } from "@/payload/services/getPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Типы, которые браузер может показать сам; остальное — только скачать. */
const INLINE = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * GET /api/support/attachments/:id[?variant=thumbnail]
 *
 * Файл вложения, расшифрованный на лету, — только тем, кому он доступен
 * (загрузивший, покупатель диалога после отправки, персонал). Чужой и
 * несуществующий неразличимы: 404.
 *
 * Заголовки ответа рассчитаны на недоверенное содержимое: sandbox-CSP и
 * nosniff не дают выполнить ничего из файла даже при прямом открытии, PDF и
 * офисные файлы отдаются на скачивание, кэш — только приватный и без
 * хранения (переписка конфиденциальна, общий компьютер — не исключение).
 */
export async function GET(
	request: NextRequest,
	ctx: { params: Promise<{ id: string }> },
) {
	try {
		const actor = await requireActor(request);
		const attachmentId = positiveInt((await ctx.params).id);
		if (!attachmentId) throw new SupportError("not_found", "Файл не найден");
		const variant =
			request.nextUrl.searchParams.get("variant") === "thumbnail"
				? "thumbnail"
				: "original";

		const file = await readAttachment(
			await getPayloadInstance(),
			actor,
			attachmentId,
			variant,
		);
		const disposition = INLINE.has(file.mimeType) ? "inline" : "attachment";
		return new Response(new Uint8Array(file.data), {
			headers: {
				"Content-Type": file.mimeType,
				"Content-Length": String(file.data.length),
				"Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
				"Cache-Control": "private, no-store",
				"X-Content-Type-Options": "nosniff",
				"Content-Security-Policy":
					"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
				"Cross-Origin-Resource-Policy": "same-origin",
				"X-Robots-Tag": "noindex, nofollow",
			},
		});
	} catch (error) {
		return errorResponse(error, "/api/support/attachments/[id]");
	}
}
