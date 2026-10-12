import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/modules/auth/lib/rateLimit";
import { ATTACHMENT_MAX_BYTES } from "@/modules/support-chat/lib/constants";
import { storeAttachment } from "@/modules/support-chat/server/attachments";
import { SupportError } from "@/modules/support-chat/server/errors";
import {
	assertSameSite,
	errorResponse,
	json,
	requireActor,
} from "@/modules/support-chat/server/http";
import {
	getSupportConfig,
	isChatOpenForUser,
} from "@/modules/support-chat/server/settings";
import { getPayloadInstance } from "@/payload/services/getPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Запас на разметку multipart сверх размера самого файла. */
const MULTIPART_OVERHEAD = 64 * 1024;

const LIMITS = {
	customer: { limit: 20, windowMs: 60 * 60_000 },
	staff: { limit: 200, windowMs: 60 * 60_000 },
} as const;

/**
 * POST /api/support/attachments — загрузить файл до отправки сообщения.
 * multipart/form-data, поле `file`. Ответ — вложение с id: его передают в
 * `attachmentIds` сообщения. Пока файл не отправлен, его видит только
 * загрузивший.
 *
 * Проверка, перекодирование и шифрование — в server/attachments.ts.
 */
export async function POST(request: NextRequest) {
	try {
		assertSameSite(request);
		const actor = await requireActor(request);
		const payload = await getPayloadInstance();

		if (actor.kind === "customer") {
			const config = await getSupportConfig(payload);
			if (!isChatOpenForUser(config, actor.userId)) {
				throw new SupportError("disabled", "Чат с менеджером пока недоступен");
			}
		}

		// Размер — до чтения тела: 200-мегабайтный запрос не должен попасть в память.
		const declared = Number(request.headers.get("content-length") ?? "0");
		if (declared > ATTACHMENT_MAX_BYTES + MULTIPART_OVERHEAD) {
			return json(
				{ error: { code: "invalid", message: "Файл больше 10 МБ" } },
				{ status: 413 },
			);
		}

		const limit = LIMITS[actor.kind];
		const key = `support:upload:${actor.kind}:${actor.kind === "customer" ? actor.userId : actor.adminId}`;
		if (!(await checkRateLimit(key, limit.limit, limit.windowMs)).allowed) {
			throw new SupportError(
				"rate_limited",
				"Слишком много файлов — подождите немного",
			);
		}

		let file: FormDataEntryValue | null;
		try {
			file = (await request.formData()).get("file");
		} catch {
			throw new SupportError(
				"invalid",
				"Ожидается multipart/form-data с полем file",
			);
		}
		if (!(file instanceof File)) {
			throw new SupportError("invalid", "Ожидается файл в поле file");
		}

		const attachment = await storeAttachment(payload, {
			actor,
			filename: file.name,
			data: Buffer.from(await file.arrayBuffer()),
		});
		return json({ attachment }, { status: 201 });
	} catch (error) {
		return errorResponse(error, "/api/support/attachments");
	}
}
