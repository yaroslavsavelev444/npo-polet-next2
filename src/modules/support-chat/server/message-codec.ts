import type { MessageContext } from "../lib/events.ts";
import { aad, decryptText, encryptText, unwrapDataKey } from "./crypto.ts";

/**
 * Что лежит в support_messages.body: шифртекст одного JSON-конверта.
 *
 *   { v: 1, t: "текст", c: { контекст } | null, m: [id документов Media] }
 *
 * В конверте всё, что раскрывает содержание переписки: текст, о каком заказе
 * или товаре речь, какие документы отправили. Открыто остаются только
 * служебные поля, без которых не работают права и порядок: диалог, номер,
 * вид, автор, время.
 */

export interface MessagePayload {
	text: string;
	context: MessageContext | null;
	mediaIds: number[];
}

export interface MessagePlace {
	conversationId: number;
	seq: number;
	kind: string;
	authorType: string;
}

export const UNREADABLE_TEXT = "[не удалось расшифровать]";

export function encodeMessagePayload(
	key: Buffer,
	place: MessagePlace,
	payload: MessagePayload,
): string {
	const envelope = JSON.stringify({
		v: 1,
		t: payload.text,
		c: payload.context,
		m: payload.mediaIds,
	});
	return encryptText(key, envelope, aad.message(place));
}

/**
 * Расшифровать конверт. null — не удалось (подмена, чужое место, нет ключа):
 * вызывающий показывает пометку вместо текста и пишет в журнал, но не
 * роняет весь список из-за одной записи.
 */
export function decodeMessagePayload(
	wrappedKey: string | null | undefined,
	place: MessagePlace,
	ciphertext: unknown,
): MessagePayload | null {
	if (typeof ciphertext !== "string" || !wrappedKey) return null;
	try {
		const envelope = JSON.parse(
			decryptText(unwrapDataKey(wrappedKey), ciphertext, aad.message(place)),
		) as { t?: unknown; c?: unknown; m?: unknown };
		return {
			text: typeof envelope.t === "string" ? envelope.t : "",
			context:
				envelope.c && typeof envelope.c === "object"
					? (envelope.c as MessageContext)
					: null,
			mediaIds: Array.isArray(envelope.m)
				? envelope.m.map(Number).filter(Number.isSafeInteger)
				: [],
		};
	} catch {
		return null;
	}
}
