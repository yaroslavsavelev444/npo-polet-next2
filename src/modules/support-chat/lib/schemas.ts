import { z } from "zod";
import {
	CSAT_COMMENT_MAX_LENGTH,
	MESSAGE_MAX_ATTACHMENTS,
	MESSAGE_MAX_LENGTH,
	SUPPORT_TOPIC_VALUES,
	TAG_MAX_LENGTH,
	TAGS_MAX,
} from "./constants.ts";

/**
 * Схемы входящих событий шлюза. Одни и те же для сервера (валидация) и
 * клиента (типы и ранняя проверка формы до отправки).
 *
 * Сервер не доверяет ничему, что прошло только клиентскую проверку: схема —
 * первая граница, права на диалог — вторая (permissions.ts).
 */

const id = z.number().int().positive();

/**
 * Текст сообщения: обрезка пробелов по краям, без управляющих символов,
 * кроме переводов строки и табуляции. Нулевой байт Postgres в тексте не
 * примет вовсе, а остальное управляющее — мусор, ломающий отображение.
 */
const body = z
	.string()
	.transform((value) =>
		value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim(),
	)
	.pipe(z.string().max(MESSAGE_MAX_LENGTH));

const context = z
	.object({
		type: z.enum(["order", "product", "page"]),
		id: z.union([z.string().max(64), z.number().int()]).optional(),
		title: z.string().max(200).optional(),
		// Только относительный путь сайта: абсолютный URL в контексте — готовая
		// ссылка на чужой сайт, которую менеджер увидит как «страницу клиента».
		url: z
			.string()
			.max(500)
			.regex(/^\/(?!\/)[^\s]*$/, "Ожидается путь сайта, начинающийся с /")
			.optional(),
	})
	.strict();

const attachmentIds = z.array(id).max(MESSAGE_MAX_ATTACHMENTS).default([]);

const withContent = <
	T extends { body: string; attachmentIds: number[]; documentIds?: number[] },
>(
	value: T,
) =>
	value.body.length > 0 ||
	value.attachmentIds.length > 0 ||
	(value.documentIds?.length ?? 0) > 0;

export const messageSendSchema = z
	.object({
		clientMessageId: z.uuid(),
		body,
		attachmentIds,
		context: context.optional(),
		/** Тема — только для первого сообщения нового диалога. */
		topic: z.enum(SUPPORT_TOPIC_VALUES).optional(),
		/**
		 * Согласие на обработку ПДн: обязательно, когда сообщение начинает
		 * новый диалог, а прежнего согласия нет (см. conversations.db.ts).
		 */
		consent: z.object({ document: z.string().min(1).max(100) }).optional(),
	})
	.refine(withContent, { message: "Пустое сообщение" });

/** Открытие виджета: данных не требуется; что угодно сверх — игнорируется. */
export const conversationOpenSchema = z.unknown().transform(() => ({}));

export const conversationReadSchema = z.object({
	conversationId: id,
	seq: z.number().int().min(0),
});

export const typingSchema = z.object({
	conversationId: id,
	active: z.boolean(),
});

export const syncSchema = z.object({
	conversationId: id,
	afterSeq: z.number().int().min(0),
});

export const historySchema = z.object({
	conversationId: id,
	beforeSeq: z.number().int().min(1),
});

export const csatSchema = z.object({
	conversationId: id,
	score: z.number().int().min(1).max(5),
	comment: z.string().trim().max(CSAT_COMMENT_MAX_LENGTH).optional(),
});

// ─── Персонал ───────────────────────────────────────────────────────────────

export const staffListSchema = z.object({
	tab: z.enum(["mine", "queue", "open", "snoozed", "resolved"]),
	/** Курсор: lastMessageAt последней строки предыдущей страницы. */
	before: z.iso.datetime().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const staffConversationSchema = z.object({ conversationId: id });

export const staffMessageSendSchema = z
	.object({
		conversationId: id,
		clientMessageId: z.uuid(),
		body,
		attachmentIds,
		kind: z.enum(["text", "note"]).default("text"),
		cannedResponseId: id.optional(),
		/** Документы из Media (сертификаты из заготовки) — публичные файлы сайта. */
		documentIds: z.array(id).max(MESSAGE_MAX_ATTACHMENTS).default([]),
	})
	.refine(withContent, { message: "Пустое сообщение" });

export const staffTransferSchema = z.object({
	conversationId: id,
	toAdminId: id,
	note: body.optional(),
});

export const staffSnoozeSchema = z.object({
	conversationId: id,
	until: z.iso.datetime(),
});

export const staffTagsSchema = z.object({
	conversationId: id,
	tags: z
		.array(z.string().trim().min(1).max(TAG_MAX_LENGTH))
		.max(TAGS_MAX)
		.transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]),
});

export const staffPresenceSchema = z.object({
	status: z.enum(["available", "away"]),
});

export const staffSuggestionsSchema = z.object({
	conversationId: id,
	text: z.string().max(MESSAGE_MAX_LENGTH),
});

export type MessageSendInput = z.infer<typeof messageSendSchema>;
export type StaffMessageSendInput = z.infer<typeof staffMessageSendSchema>;
export type StaffListInput = z.infer<typeof staffListSchema>;
