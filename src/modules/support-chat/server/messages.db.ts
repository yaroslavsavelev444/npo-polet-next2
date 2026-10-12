import { sql } from "@payloadcms/db-postgres";
import type { MessageAuthorType, MessageKind } from "../lib/constants.ts";
import type {
	MessageContext,
	SupportAttachmentDTO,
	SupportDocumentDTO,
	SupportMessageDTO,
} from "../lib/events.ts";
import { mediaFileUrl } from "./conversations.db.ts";
import { aad, decryptText, unwrapDataKey } from "./crypto.ts";
import {
	type Executor,
	intArray,
	iso,
	num,
	numOrNull,
	query,
	queryOne,
	type Row,
	type SQL,
	str,
} from "./db.ts";
import { SupportError } from "./errors.ts";
import {
	decodeMessagePayload,
	encodeMessagePayload,
	UNREADABLE_TEXT,
} from "./message-codec.ts";

/**
 * Сообщения диалога.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * НОМЕР СООБЩЕНИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * `appendMessage` вызывается ТОЛЬКО внутри транзакции, где строка диалога уже
 * заблокирована (`lockConversation`). Блокировка сериализует запись в один
 * диалог, поэтому `last_seq + 1` не даёт ни повторов, ни дыр, а проверка
 * `clientMessageId` до вставки не может проиграть гонку повтору самой себя.
 *
 * Внутренние заметки занимают номера в той же последовательности. Покупатель
 * их не получает, поэтому у него номера идут с пропусками — клиент обязан
 * опираться на порядок и «новее чем», а не на непрерывность.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ШИФРОВАНИЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Текст, контекст и документы уходят в базу одним шифртекстом (message-codec),
 * привязанным к диалогу, номеру, виду и автору. Номер выдаётся до вставки —
 * поэтому шифрование здесь, а не у вызывающего: только тут известно место.
 */

export type MessageAudience = "customer" | "staff";

export interface AppendMessageInput {
	conversationId: number;
	authorType: MessageAuthorType;
	authorUserId?: number | null;
	authorAdminId?: number | null;
	kind: MessageKind;
	/** Ключ данных диалога (LockedConversation.key). */
	key: Buffer;
	body: string;
	context?: MessageContext | null;
	/** Публичные документы из Media (сертификаты из заготовки). */
	mediaIds?: number[];
	clientMessageId?: string | null;
	cannedResponseId?: number | null;
	attachmentIds?: number[];
	/**
	 * Кому из покупателей станет доступен файл вложения. Только для сообщений,
	 * которые видит покупатель; у заметки — null.
	 */
	attachmentsVisibleToUserId?: number | null;
}

const SELECT_MESSAGE = sql`
	SELECT
		m.*,
		COALESCE(NULLIF(TRIM(a.support_display_name), ''), a.name) AS admin_name,
		COALESCE(am.sizes_thumbnail_filename, am.filename) AS admin_avatar,
		u.name AS user_name,
		conv.encryption_key AS conversation_key
	FROM support_messages m
	JOIN support_conversations conv ON conv.id = m.conversation_id
	LEFT JOIN admins a ON a.id = m.author_admin_id
	LEFT JOIN media am ON am.id = a.support_avatar_id
	LEFT JOIN users u ON u.id = m.author_user_id
`;

export async function findMessageByClientId(
	db: Executor,
	conversationId: number,
	clientMessageId: string,
): Promise<Row | null> {
	return queryOne(
		db,
		sql`${SELECT_MESSAGE}
			WHERE m.conversation_id = ${conversationId}
				AND m.client_message_id = ${clientMessageId}`,
	);
}

/**
 * Вставить сообщение, выдать ему номер и прикрепить вложения. Возвращает
 * строку сообщения (с автором — для DTO).
 */
export async function appendMessage(
	tx: Executor,
	input: AppendMessageInput,
): Promise<Row> {
	const seqRow = await queryOne(
		tx,
		sql`UPDATE support_conversations SET last_seq = last_seq + 1
			WHERE id = ${input.conversationId}
			RETURNING last_seq`,
	);
	if (!seqRow) throw new SupportError("not_found", "Диалог не найден");
	const seq = num(seqRow.last_seq);

	const ciphertext = encodeMessagePayload(
		input.key,
		{
			conversationId: input.conversationId,
			seq,
			kind: input.kind,
			authorType: input.authorType,
		},
		{
			text: input.body,
			context: input.context ?? null,
			mediaIds: input.mediaIds ?? [],
		},
	);

	const inserted = await queryOne(
		tx,
		sql`INSERT INTO support_messages (
				conversation_id, seq, author_type, author_user_id, author_admin_id,
				kind, body, client_message_id, canned_response_id
			) VALUES (
				${input.conversationId}, ${seq}, ${input.authorType},
				${input.authorUserId ?? null}, ${input.authorAdminId ?? null},
				${input.kind}, ${ciphertext},
				${input.clientMessageId ?? null}, ${input.cannedResponseId ?? null}
			)
			RETURNING id`,
	);
	const messageId = num(inserted?.id);

	const attachmentIds = input.attachmentIds ?? [];
	if (attachmentIds.length > 0) {
		await attachUploads(tx, {
			messageId,
			conversationId: input.conversationId,
			attachmentIds,
			uploadedBy:
				input.authorType === "customer"
					? sql`uploaded_by_user_id = ${input.authorUserId ?? null}`
					: sql`uploaded_by_admin_id = ${input.authorAdminId ?? null}`,
			visibleToUserId: input.attachmentsVisibleToUserId ?? null,
		});
	}

	const row = await queryOne(
		tx,
		sql`${SELECT_MESSAGE} WHERE m.id = ${messageId}`,
	);
	if (!row) throw new Error("Вставленное сообщение не найдено");
	return row;
}

/**
 * Прикрепить загруженные файлы. Только свои и только ещё не прикреплённые:
 * иначе id чужого вложения в запросе давал бы доступ к нему (поле
 * `visible_to_user_id` открыло бы файл покупателю). Не совпало число —
 * значит, в запросе было чужое или уже отправленное, и вся транзакция
 * откатывается вместе с сообщением.
 */
async function attachUploads(
	tx: Executor,
	options: {
		messageId: number;
		conversationId: number;
		attachmentIds: number[];
		uploadedBy: SQL;
		visibleToUserId: number | null;
	},
): Promise<void> {
	const ids = [...new Set(options.attachmentIds)];
	const rows = await query(
		tx,
		sql`UPDATE support_attachments
			SET message_id = ${options.messageId},
				conversation_id = ${options.conversationId},
				visible_to_user_id = ${options.visibleToUserId},
				attached_at = now(),
				updated_at = now()
			WHERE id = ANY(${intArray(ids)})
				AND message_id IS NULL
				AND ${options.uploadedBy}
			RETURNING id`,
	);
	if (rows.length !== ids.length) {
		throw new SupportError("invalid", "Вложение недоступно или уже отправлено");
	}
}

// ─── Чтение ─────────────────────────────────────────────────────────────────

function audienceFilter(audience: MessageAudience): SQL {
	return audience === "customer" ? sql`AND m.kind <> 'note'` : sql``;
}

/** Сообщения новее номера, по возрастанию. */
export async function listMessagesAfter(
	db: Executor,
	conversationId: number,
	afterSeq: number,
	limit: number,
	audience: MessageAudience,
): Promise<Row[]> {
	return query(
		db,
		sql`${SELECT_MESSAGE}
			WHERE m.conversation_id = ${conversationId} AND m.seq > ${afterSeq}
				${audienceFilter(audience)}
			ORDER BY m.seq ASC
			LIMIT ${limit}`,
	);
}

/**
 * Страница сообщений старше номера, по возрастанию. `hasMore` — есть ли ещё
 * более старые (берётся на одну строку больше страницы).
 */
export async function listMessagesBefore(
	db: Executor,
	conversationId: number,
	beforeSeq: number,
	limit: number,
	audience: MessageAudience,
): Promise<{ rows: Row[]; hasMore: boolean }> {
	const rows = await query(
		db,
		sql`${SELECT_MESSAGE}
			WHERE m.conversation_id = ${conversationId} AND m.seq < ${beforeSeq}
				${audienceFilter(audience)}
			ORDER BY m.seq DESC
			LIMIT ${limit + 1}`,
	);
	const hasMore = rows.length > limit;
	return { rows: rows.slice(0, limit).reverse(), hasMore };
}

// ─── Приведение ─────────────────────────────────────────────────────────────

/** Относительные адреса: работают и на витрине, и на хосте админки. */
export function attachmentUrls(id: number, hasThumbnail: boolean) {
	const url = `/api/support/attachments/${id}`;
	return {
		url,
		thumbnailUrl: hasThumbnail ? `${url}?variant=thumbnail` : null,
	};
}

/** Исходное имя вложения: зашифровано собственным ключом вложения. */
export function decryptAttachmentName(row: Row): string {
	try {
		return decryptText(
			unwrapDataKey(String(row.encryption_key)),
			String(row.encrypted_name),
			aad.attachmentName(String(row.storage_key)),
		);
	} catch {
		return "файл";
	}
}

export function toAttachmentDTO(row: Row): SupportAttachmentDTO {
	return {
		id: num(row.id),
		filename: decryptAttachmentName(row),
		mimeType: str(row.mime_type),
		filesize: numOrNull(row.filesize),
		width: numOrNull(row.width),
		height: numOrNull(row.height),
		...attachmentUrls(num(row.id), row.has_thumbnail === true),
	};
}

/** Вложения пачки сообщений: messageId → файлы. */
export async function loadAttachments(
	db: Executor,
	messageIds: number[],
): Promise<Map<number, SupportAttachmentDTO[]>> {
	const byMessage = new Map<number, SupportAttachmentDTO[]>();
	if (messageIds.length === 0) return byMessage;

	const rows = await query(
		db,
		sql`SELECT id, message_id, mime_type, filesize, width, height, has_thumbnail,
				storage_key, encrypted_name, encryption_key
			FROM support_attachments
			WHERE message_id = ANY(${intArray(messageIds)})
			ORDER BY id`,
	);
	for (const row of rows) {
		const messageId = num(row.message_id);
		const list = byMessage.get(messageId) ?? [];
		list.push(toAttachmentDTO(row));
		byMessage.set(messageId, list);
	}
	return byMessage;
}

/** Документы из Media по id: публичные файлы сайта (сертификаты, паспорта). */
export async function loadDocuments(
	db: Executor,
	mediaIds: number[],
): Promise<Map<number, SupportDocumentDTO>> {
	const byId = new Map<number, SupportDocumentDTO>();
	const ids = [...new Set(mediaIds)];
	if (ids.length === 0) return byId;

	const rows = await query(
		db,
		sql`SELECT id, filename, mime_type, filesize, alt, caption
			FROM media WHERE id = ANY(${intArray(ids)})`,
	);
	for (const row of rows) {
		const url = mediaFileUrl(row.filename);
		if (!url) continue;
		byId.set(num(row.id), {
			id: num(row.id),
			title: str(row.caption) || str(row.alt) || String(row.filename),
			mimeType: str(row.mime_type),
			filesize: numOrNull(row.filesize),
			url,
		});
	}
	return byId;
}

interface DecodedRow {
	row: Row;
	text: string;
	context: MessageContext | null;
	mediaIds: number[];
	readable: boolean;
}

function decodeRow(row: Row): DecodedRow {
	const payload = decodeMessagePayload(
		str(row.conversation_key),
		{
			conversationId: num(row.conversation_id),
			seq: num(row.seq),
			kind: String(row.kind),
			authorType: String(row.author_type),
		},
		row.body,
	);
	return payload
		? { row, ...payload, text: payload.text, readable: true }
		: {
				row,
				text: UNREADABLE_TEXT,
				context: null,
				mediaIds: [],
				readable: false,
			};
}

/**
 * Строка → DTO для конкретной аудитории.
 *
 * Покупателю автор-менеджер показывается только именем для покупателей и
 * фото; свои сообщения — без автора. id менеджера, использованная
 * заготовка — только персоналу.
 */
function toMessageDTO(
	decoded: DecodedRow,
	attachments: SupportAttachmentDTO[],
	documents: SupportDocumentDTO[],
	audience: MessageAudience,
): SupportMessageDTO {
	const { row } = decoded;
	const authorType = row.author_type as MessageAuthorType;
	let author: SupportMessageDTO["author"] = null;
	if (authorType === "staff" && row.admin_name) {
		author = {
			name: String(row.admin_name),
			avatarUrl: mediaFileUrl(row.admin_avatar),
		};
	} else if (authorType === "customer" && audience === "staff") {
		author = { name: str(row.user_name) ?? "Покупатель", avatarUrl: null };
	}

	const dto: SupportMessageDTO = {
		id: num(row.id),
		conversationId: num(row.conversation_id),
		seq: num(row.seq),
		authorType,
		kind: row.kind as MessageKind,
		body: decoded.text,
		author,
		context: decoded.context,
		attachments,
		documents,
		clientMessageId: str(row.client_message_id),
		createdAt: iso(row.created_at) as string,
		editedAt: iso(row.edited_at),
	};
	if (audience === "staff") {
		dto.authorAdminId = numOrNull(row.author_admin_id);
		dto.cannedResponseId = numOrNull(row.canned_response_id);
	}
	return dto;
}

/**
 * Пачка строк → DTO: расшифровка, вложения и документы одним запросом на
 * пачку. Нерасшифровавшиеся строки остаются в ленте с пометкой — чтобы
 * порядок не рвался — и попадают в журнал (без содержимого, только id).
 */
export async function toMessageDTOs(
	db: Executor,
	rows: Row[],
	audience: MessageAudience,
): Promise<SupportMessageDTO[]> {
	const decoded = rows.map(decodeRow);
	const [attachments, documents] = await Promise.all([
		loadAttachments(
			db,
			rows.map((row) => num(row.id)),
		),
		loadDocuments(
			db,
			decoded.flatMap((d) => d.mediaIds),
		),
	]);
	const unreadable = decoded.filter((d) => !d.readable);
	if (unreadable.length > 0) {
		console.error("[support-chat] сообщения не расшифровались", {
			messageIds: unreadable.map((d) => num(d.row.id)),
		});
	}
	return decoded.map((d) =>
		toMessageDTO(
			d,
			attachments.get(num(d.row.id)) ?? [],
			d.mediaIds.flatMap((id) => documents.get(id) ?? []),
			audience,
		),
	);
}
