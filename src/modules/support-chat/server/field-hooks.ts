import { sql } from "@payloadcms/db-postgres";
import type { FieldHook, Payload } from "payload";
import { aad, decryptText, unwrapDataKey } from "./crypto.ts";
import { drizzleOf, queryOne } from "./db.ts";

/**
 * Расшифровка полей при чтении через API Payload (REST, Local API, админка).
 *
 * Сам модуль чата читает базу сырым SQL и расшифровывает в DTO
 * (messages.db.ts) — эти хуки нужны, чтобы и стандартные пути Payload
 * отдавали текст, а не шифртекст: в админке, в REST владельцу диалога.
 * Права при этом прежние — access коллекции отрабатывает до хуков.
 *
 * Файл — в графе импортов payload.config.ts: только относительные пути с
 * расширением (см. scripts/verify-payload-graph.mjs).
 *
 * Ошибка расшифровки не роняет чтение: поле получает пометку, а не
 * исключение, — одна повреждённая запись не должна ломать список.
 */

export const UNREADABLE = "[не удалось расшифровать]";

async function conversationKey(
	payload: Payload,
	conversationId: unknown,
): Promise<Buffer | null> {
	const id = Number(
		typeof conversationId === "object" && conversationId !== null
			? (conversationId as { id: unknown }).id
			: conversationId,
	);
	if (!Number.isSafeInteger(id)) return null;
	const row = await queryOne(
		drizzleOf(payload),
		sql`SELECT encryption_key FROM support_conversations WHERE id = ${id}`,
	);
	const wrapped = row?.encryption_key;
	return typeof wrapped === "string" ? unwrapDataKey(wrapped) : null;
}

/** support-messages.body: в базе — шифртекст JSON {t, c, m}; наружу — текст. */
export const decryptMessageBodyOnRead: FieldHook = async ({
	value,
	data,
	req,
}) => {
	if (typeof value !== "string" || !data) return value;
	try {
		const key = await conversationKey(req.payload, data.conversation);
		if (!key) return UNREADABLE;
		const json = decryptText(
			key,
			value,
			aad.message({
				conversationId: Number(
					typeof data.conversation === "object"
						? data.conversation?.id
						: data.conversation,
				),
				seq: Number(data.seq),
				kind: String(data.kind),
				authorType: String(data.authorType),
			}),
		);
		return (JSON.parse(json) as { t?: string }).t ?? "";
	} catch {
		return UNREADABLE;
	}
};

/** support-conversations.csatComment: шифртекст → текст. */
export const decryptCsatCommentOnRead: FieldHook = async ({
	value,
	data,
	req,
}) => {
	if (typeof value !== "string" || !value || !data?.id) return value;
	try {
		const key = await conversationKey(req.payload, data.id);
		return key
			? decryptText(key, value, aad.csat(Number(data.id)))
			: UNREADABLE;
	} catch {
		return UNREADABLE;
	}
};
