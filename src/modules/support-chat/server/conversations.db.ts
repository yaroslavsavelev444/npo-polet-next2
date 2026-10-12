import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import type {
	ConversationPriority,
	ConversationStatus,
	MessageAuthorType,
	SupportTopic,
} from "../lib/constants.ts";
import type {
	StaffConversationDTO,
	SupportConversationDTO,
	SupportPersonDTO,
} from "../lib/events.ts";
import { aad, encryptText, generateDataKey, unwrapDataKey } from "./crypto.ts";
import {
	drizzleOf,
	type Executor,
	iso,
	isUniqueViolation,
	num,
	numOrNull,
	query,
	queryOne,
	type Row,
	type SQL,
	str,
} from "./db.ts";
import { SupportError } from "./errors.ts";
import { decodeMessagePayload, UNREADABLE_TEXT } from "./message-codec.ts";

/**
 * Диалоги поддержки: чтение, создание, смена состояния.
 *
 * Здесь только SQL и приведение строк. Права, события и порядок шагов — в
 * support.service.ts; транзакцию, если она нужна, открывает он же и
 * передаёт сюда как Executor.
 */

export const ONE_OPEN_PER_USER_INDEX =
	"support_conversations_one_open_per_user_idx";

export interface ConversationRecord {
	id: number;
	userId: number | null;
	status: ConversationStatus;
	topic: SupportTopic;
	priority: ConversationPriority;
	assigneeId: number | null;
	assignedAt: string | null;
	lastSeq: number;
	customerLastReadSeq: number;
	staffLastReadSeq: number;
	lastMessageAt: string | null;
	awaitingReplySince: string | null;
	firstResponseAt: string | null;
	resolvedAt: string | null;
	snoozedUntil: string | null;
	csatScore: number | null;
	createdAt: string;
	tags: string[];
	assignee: SupportPersonDTO | null;
	customer: { id: number; name: string; email: string } | null;
	lastMessagePreview: string | null;
	lastMessageAuthorType: MessageAuthorType | null;
	/** Обёрнутый ключ данных диалога. Только для сервера — в DTO не попадает. */
	encryptionKey: string;
}

export function mediaFileUrl(filename: unknown): string | null {
	return typeof filename === "string" && filename
		? `/api/media/file/${encodeURIComponent(filename)}`
		: null;
}

/**
 * Полная строка диалога: менеджер (имя для покупателей и аватар), покупатель,
 * метки, последнее сообщение для превью в списке консоли.
 */
const SELECT_CONVERSATION = sql`
	SELECT
		c.*,
		COALESCE(NULLIF(TRIM(a.support_display_name), ''), a.name) AS assignee_name,
		COALESCE(am.sizes_thumbnail_filename, am.filename) AS assignee_avatar,
		u.name AS customer_name,
		u.email AS customer_email,
		COALESCE(
			(SELECT array_agg(t.text ORDER BY t."order")
				FROM support_conversations_texts t
				WHERE t.parent_id = c.id AND t.path = 'tags'),
			'{}'
		) AS tags,
		lm.body AS last_body,
		lm.seq AS last_seq_of_message,
		lm.kind AS last_kind,
		lm.author_type AS last_author_type
	FROM support_conversations c
	LEFT JOIN admins a ON a.id = c.assignee_id
	LEFT JOIN media am ON am.id = a.support_avatar_id
	LEFT JOIN users u ON u.id = c.user_id
	LEFT JOIN LATERAL (
		SELECT m.body, m.seq, m.kind, m.author_type
		FROM support_messages m
		WHERE m.conversation_id = c.id
		ORDER BY m.seq DESC
		LIMIT 1
	) lm ON TRUE
`;

function toRecord(row: Row): ConversationRecord {
	const userId = numOrNull(row.user_id);
	const assigneeId = numOrNull(row.assignee_id);
	return {
		id: num(row.id),
		userId,
		status: row.status as ConversationStatus,
		topic: row.topic as SupportTopic,
		priority: row.priority as ConversationPriority,
		assigneeId,
		assignedAt: iso(row.assigned_at),
		lastSeq: num(row.last_seq),
		customerLastReadSeq: num(row.customer_last_read_seq),
		staffLastReadSeq: num(row.staff_last_read_seq),
		lastMessageAt: iso(row.last_message_at),
		awaitingReplySince: iso(row.awaiting_reply_since),
		firstResponseAt: iso(row.first_response_at),
		resolvedAt: iso(row.resolved_at),
		snoozedUntil: iso(row.snoozed_until),
		csatScore: numOrNull(row.csat_score),
		createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
		tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
		assignee:
			assigneeId !== null && row.assignee_name
				? {
						name: String(row.assignee_name),
						avatarUrl: mediaFileUrl(row.assignee_avatar),
					}
				: null,
		customer:
			userId !== null
				? {
						id: userId,
						name: str(row.customer_name) ?? "",
						email: str(row.customer_email) ?? "",
					}
				: null,
		lastMessagePreview: previewOf(row),
		lastMessageAuthorType: (row.last_author_type as MessageAuthorType) ?? null,
		encryptionKey: String(row.encryption_key),
	};
}

/** Превью последнего сообщения для списка консоли — расшифрованное. */
function previewOf(row: Row): string | null {
	if (row.last_body === null || row.last_body === undefined) return null;
	const payload = decodeMessagePayload(
		str(row.encryption_key),
		{
			conversationId: num(row.id),
			seq: num(row.last_seq_of_message),
			kind: String(row.last_kind),
			authorType: String(row.last_author_type),
		},
		row.last_body,
	);
	if (!payload) return UNREADABLE_TEXT;
	const flat = payload.text.replace(/\s+/g, " ").trim();
	if (!flat) return payload.mediaIds.length > 0 ? "📎 Документ" : null;
	return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

/**
 * Ключ обезличенного диалога уничтожен (maintenance.ts) — писать в такой
 * диалог нечем и некому: понятный отказ вместо ошибки расшифровки.
 */
function unwrapLiveKey(wrapped: string): Buffer {
	if (!wrapped) {
		throw new SupportError(
			"conflict",
			"Переписка обезличена — продолжить её нельзя",
		);
	}
	return unwrapDataKey(wrapped);
}

/** Ключ данных диалога в открытом виде — для шифрования и расшифровки. */
export function conversationDataKey(record: { encryptionKey: string }): Buffer {
	return unwrapLiveKey(record.encryptionKey);
}

export function toCustomerConversationDTO(
	record: ConversationRecord,
): SupportConversationDTO {
	return {
		id: record.id,
		status: record.status,
		topic: record.topic,
		lastSeq: record.lastSeq,
		customerLastReadSeq: record.customerLastReadSeq,
		staffLastReadSeq: record.staffLastReadSeq,
		assignee: record.assignee,
		lastMessageAt: record.lastMessageAt,
		resolvedAt: record.resolvedAt,
		csatScore: record.csatScore,
		createdAt: record.createdAt,
	};
}

export function toStaffConversationDTO(
	record: ConversationRecord,
): StaffConversationDTO {
	return {
		...toCustomerConversationDTO(record),
		assigneeId: record.assigneeId,
		priority: record.priority,
		tags: record.tags,
		snoozedUntil: record.snoozedUntil,
		awaitingReplySince: record.awaitingReplySince,
		firstResponseAt: record.firstResponseAt,
		customer: record.customer,
		lastMessagePreview: record.lastMessagePreview,
		lastMessageAuthorType: record.lastMessageAuthorType,
	};
}

// ─── Чтение ─────────────────────────────────────────────────────────────────

export async function getConversation(
	db: Executor,
	conversationId: number,
): Promise<ConversationRecord | null> {
	const row = await queryOne(
		db,
		sql`${SELECT_CONVERSATION} WHERE c.id = ${conversationId}`,
	);
	return row ? toRecord(row) : null;
}

export async function getOpenConversationForUser(
	db: Executor,
	userId: number,
): Promise<ConversationRecord | null> {
	const row = await queryOne(
		db,
		sql`${SELECT_CONVERSATION} WHERE c.user_id = ${userId} AND c.status = 'open'`,
	);
	return row ? toRecord(row) : null;
}

/**
 * Диалог, который покупатель видит в виджете: открытый, а если его нет —
 * последний закрытый (чтобы после закрытия была видна история и форма оценки).
 */
export async function getLatestConversationForUser(
	db: Executor,
	userId: number,
): Promise<ConversationRecord | null> {
	const row = await queryOne(
		db,
		sql`${SELECT_CONVERSATION}
			WHERE c.user_id = ${userId}
			ORDER BY (c.status = 'open') DESC, c.last_message_at DESC NULLS LAST, c.id DESC
			LIMIT 1`,
	);
	return row ? toRecord(row) : null;
}

export interface LockedConversation {
	id: number;
	userId: number | null;
	status: ConversationStatus;
	assigneeId: number | null;
	/** Ключ данных диалога, уже развёрнутый. */
	key: Buffer;
}

/** Блокирует строку диалога до конца транзакции; сериализует запись в диалог. */
export async function lockConversation(
	tx: Executor,
	conversationId: number,
): Promise<LockedConversation | null> {
	const row = await queryOne(
		tx,
		sql`SELECT id, user_id, status, assignee_id, encryption_key FROM support_conversations
			WHERE id = ${conversationId} FOR UPDATE`,
	);
	if (!row) return null;
	return {
		id: num(row.id),
		userId: numOrNull(row.user_id),
		status: row.status as ConversationStatus,
		assigneeId: numOrNull(row.assignee_id),
		key: unwrapLiveKey(String(row.encryption_key)),
	};
}

export type StaffListTab = "mine" | "queue" | "open" | "snoozed" | "resolved";

/**
 * Список консоли. Открытые вкладки упорядочены «дольше всех ждёт ответа —
 * выше», затем по свежести; закрытые — по свежести. Курсор — lastMessageAt
 * последней строки (для закрытых) — достаточно для подгрузки, точная
 * пагинация консоли здесь не нужна.
 */
export async function listConversationsForStaff(
	db: Executor,
	options: {
		tab: StaffListTab;
		adminId: number;
		before?: string;
		limit: number;
	},
): Promise<ConversationRecord[]> {
	const { tab, adminId, before, limit } = options;
	const notSnoozed = sql`(c.snoozed_until IS NULL OR c.snoozed_until <= now())`;

	const filters: Record<StaffListTab, SQL> = {
		mine: sql`c.status = 'open' AND c.assignee_id = ${adminId} AND ${notSnoozed}`,
		queue: sql`c.status = 'open' AND c.assignee_id IS NULL AND ${notSnoozed}`,
		open: sql`c.status = 'open' AND ${notSnoozed}`,
		snoozed: sql`c.status = 'open' AND c.snoozed_until > now()`,
		resolved: sql`c.status = 'resolved'`,
	};

	const cursor = before ? sql`AND c.last_message_at < ${before}` : sql``;
	const order =
		tab === "resolved" || tab === "snoozed"
			? sql`ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC`
			: sql`ORDER BY c.awaiting_reply_since ASC NULLS LAST, c.last_message_at DESC NULLS LAST, c.id DESC`;

	const rows = await query(
		db,
		sql`${SELECT_CONVERSATION} WHERE ${filters[tab]} ${cursor} ${order} LIMIT ${limit}`,
	);
	return rows.map(toRecord);
}

/** Открытых диалогов на каждом менеджере — для распределения. */
export async function countOpenByAssignee(
	db: Executor,
): Promise<Map<number, number>> {
	const rows = await query(
		db,
		sql`SELECT assignee_id, count(*)::int AS n FROM support_conversations
			WHERE status = 'open' AND assignee_id IS NOT NULL
			GROUP BY assignee_id`,
	);
	return new Map(rows.map((row) => [num(row.assignee_id), num(row.n)]));
}

/** Когда каждому менеджеру последний раз достался диалог. */
export async function lastAssignedAtByAssignee(
	db: Executor,
): Promise<Map<number, number>> {
	const rows = await query(
		db,
		sql`SELECT assignee_id, max(assigned_at) AS at FROM support_conversations
			WHERE assignee_id IS NOT NULL
			GROUP BY assignee_id`,
	);
	return new Map(
		rows.map((row) => [
			num(row.assignee_id),
			new Date(String(row.at)).getTime(),
		]),
	);
}

/** Диалогов, ждущих первого или очередного ответа. */
export async function countAwaitingReply(db: Executor): Promise<number> {
	const row = await queryOne(
		db,
		sql`SELECT count(*)::int AS n FROM support_conversations
			WHERE status = 'open' AND awaiting_reply_since IS NOT NULL`,
	);
	return num(row?.n);
}

// ─── Активный диалог покупателя ─────────────────────────────────────────────

export interface ConsentInput {
	document: string;
}

/**
 * Редакция документа согласия, если он существует и действует:
 * `slug@версия`. Версия хранится вместе со slug — по одному slug нельзя
 * восстановить, с каким текстом соглашался покупатель.
 */
async function resolveConsentDocument(
	db: Executor,
	slug: string,
): Promise<string | null> {
	const row = await queryOne(
		db,
		sql`SELECT slug, version FROM consents WHERE slug = ${slug} AND is_active = TRUE`,
	);
	return row ? `${row.slug}@${row.version ?? "1.0.0"}` : null;
}

/** Последнее согласие покупателя из прежних диалогов. */
async function findPreviousConsent(
	db: Executor,
	userId: number,
): Promise<{ acceptedAt: string; document: string } | null> {
	const row = await queryOne(
		db,
		sql`SELECT consent_accepted_at, consent_document FROM support_conversations
			WHERE user_id = ${userId} AND consent_accepted_at IS NOT NULL
			ORDER BY consent_accepted_at DESC LIMIT 1`,
	);
	if (!row) return null;
	return {
		acceptedAt: iso(row.consent_accepted_at) as string,
		document: String(row.consent_document ?? ""),
	};
}

export interface EnsureConversationResult {
	conversationId: number;
	created: boolean;
	reopened: boolean;
}

/**
 * Открытый диалог покупателя: существующий, переоткрытый недавний или новый.
 *
 * Гонку двух вкладок, одновременно начавших переписку, решает частичный
 * уникальный индекс: вторая вставка — `ON CONFLICT DO NOTHING`, и цикл
 * подхватывает диалог, созданный первой. То же для переоткрытия: если
 * параллельно уже создан новый открытый диалог, UPDATE упирается в индекс,
 * и цикл берёт его.
 *
 * Новый диалог требует согласия на обработку ПДн: из запроса или из любого
 * прежнего диалога покупателя.
 */
export async function ensureActiveConversation(
	payload: Payload,
	input: {
		userId: number;
		topic?: SupportTopic;
		consent?: ConsentInput;
		userAgent?: string | null;
		reopenWindowDays: number;
	},
): Promise<EnsureConversationResult> {
	const db = drizzleOf(payload);

	for (let attempt = 0; attempt < 3; attempt++) {
		const open = await queryOne(
			db,
			sql`SELECT id FROM support_conversations
				WHERE user_id = ${input.userId} AND status = 'open'`,
		);
		if (open)
			return { conversationId: num(open.id), created: false, reopened: false };

		if (input.reopenWindowDays > 0) {
			try {
				const reopened = await queryOne(
					db,
					sql`UPDATE support_conversations
						SET status = 'open', resolved_at = NULL, csat_score = NULL,
							csat_comment = NULL, reopened_count = reopened_count + 1,
							updated_at = now()
						WHERE id = (
							SELECT id FROM support_conversations
							WHERE user_id = ${input.userId} AND status = 'resolved'
								AND resolved_at > now() - make_interval(days => ${input.reopenWindowDays})
							ORDER BY resolved_at DESC LIMIT 1
						) AND status = 'resolved'
						RETURNING id`,
				);
				if (reopened) {
					return {
						conversationId: num(reopened.id),
						created: false,
						reopened: true,
					};
				}
			} catch (error) {
				if (isUniqueViolation(error, ONE_OPEN_PER_USER_INDEX)) continue;
				throw error;
			}
		}

		let consent: { acceptedAt: string; document: string } | null = null;
		if (input.consent) {
			const document = await resolveConsentDocument(db, input.consent.document);
			if (!document) {
				throw new SupportError("invalid", "Документ согласия не найден");
			}
			consent = { acceptedAt: new Date().toISOString(), document };
		} else {
			consent = await findPreviousConsent(db, input.userId);
		}
		if (!consent) {
			throw new SupportError(
				"consent_required",
				"Нужно согласие на обработку персональных данных",
			);
		}

		// Свой ключ данных у каждого диалога (см. crypto.ts). Проигравшая гонку
		// вставка просто выбросит свой ключ — он нигде не сохранился.
		const dataKey = generateDataKey();
		const created = await queryOne(
			db,
			sql`INSERT INTO support_conversations
					(user_id, status, topic, consent_accepted_at, consent_document, user_agent,
						encryption_key)
				VALUES (
					${input.userId}, 'open', ${input.topic ?? "other"},
					${consent.acceptedAt}, ${consent.document},
					${input.userAgent?.slice(0, 500) ?? null},
					${dataKey.wrapped}
				)
				ON CONFLICT (user_id) WHERE status = 'open' AND user_id IS NOT NULL DO NOTHING
				RETURNING id`,
		);
		if (created)
			return {
				conversationId: num(created.id),
				created: true,
				reopened: false,
			};
	}

	throw new SupportError(
		"conflict",
		"Не удалось открыть диалог, повторите попытку",
	);
}

// ─── Смена состояния ────────────────────────────────────────────────────────

/**
 * Забрать диалог из общей очереди. Условие `assignee_id IS NULL` в самом
 * UPDATE — атомарность: из двух менеджеров, нажавших «Взять» одновременно,
 * строку получает ровно один, второму вернётся false.
 */
export async function claimConversation(
	db: Executor,
	conversationId: number,
	adminId: number,
): Promise<boolean> {
	const row = await queryOne(
		db,
		sql`UPDATE support_conversations
			SET assignee_id = ${adminId}, assigned_at = now(), updated_at = now()
			WHERE id = ${conversationId} AND status = 'open' AND assignee_id IS NULL
			RETURNING id`,
	);
	return row !== null;
}

export async function assignConversation(
	db: Executor,
	conversationId: number,
	adminId: number | null,
): Promise<void> {
	await db.execute(
		sql`UPDATE support_conversations
			SET assignee_id = ${adminId},
				assigned_at = ${adminId === null ? null : sql`now()`},
				updated_at = now()
			WHERE id = ${conversationId}`,
	);
}

export async function resolveConversation(
	db: Executor,
	conversationId: number,
): Promise<boolean> {
	const row = await queryOne(
		db,
		sql`UPDATE support_conversations
			SET status = 'resolved', resolved_at = now(), awaiting_reply_since = NULL,
				snoozed_until = NULL, updated_at = now()
			WHERE id = ${conversationId} AND status = 'open'
			RETURNING id`,
	);
	return row !== null;
}

/**
 * Переоткрыть закрытый диалог из консоли. Если у покупателя уже есть другой
 * открытый, индекс не даст — менеджеру это сообщается как конфликт.
 */
export async function reopenConversation(
	db: Executor,
	conversationId: number,
): Promise<boolean> {
	try {
		const row = await queryOne(
			db,
			sql`UPDATE support_conversations
				SET status = 'open', resolved_at = NULL, reopened_count = reopened_count + 1,
					updated_at = now()
				WHERE id = ${conversationId} AND status = 'resolved'
				RETURNING id`,
		);
		return row !== null;
	} catch (error) {
		if (isUniqueViolation(error, ONE_OPEN_PER_USER_INDEX)) {
			throw new SupportError(
				"conflict",
				"У покупателя уже есть открытый диалог — продолжите его",
			);
		}
		throw error;
	}
}

export async function snoozeConversation(
	db: Executor,
	conversationId: number,
	until: string,
): Promise<boolean> {
	const row = await queryOne(
		db,
		sql`UPDATE support_conversations
			SET snoozed_until = ${until}, updated_at = now()
			WHERE id = ${conversationId} AND status = 'open'
			RETURNING id`,
	);
	return row !== null;
}

/** Метки целиком заменяются: удалить старые и вставить новые — в одной транзакции. */
export async function setConversationTags(
	tx: Executor,
	conversationId: number,
	tags: string[],
): Promise<void> {
	await tx.execute(
		sql`DELETE FROM support_conversations_texts
			WHERE parent_id = ${conversationId} AND path = 'tags'`,
	);
	for (const [order, tag] of tags.entries()) {
		await tx.execute(
			sql`INSERT INTO support_conversations_texts ("order", parent_id, path, text)
				VALUES (${order + 1}, ${conversationId}, 'tags', ${tag})`,
		);
	}
	await tx.execute(
		sql`UPDATE support_conversations SET updated_at = now() WHERE id = ${conversationId}`,
	);
}

/**
 * Отметка прочтения только растёт и не обгоняет последнее сообщение: старая
 * вкладка, приславшая устаревший номер, не снимает прочтение.
 */
export async function markConversationRead(
	db: Executor,
	conversationId: number,
	side: "customer" | "staff",
	seq: number,
): Promise<number | null> {
	const column =
		side === "customer"
			? sql`customer_last_read_seq`
			: sql`staff_last_read_seq`;
	const row = await queryOne(
		db,
		sql`UPDATE support_conversations
			SET ${column} = GREATEST(${column}, LEAST(${seq}::numeric, last_seq))
			WHERE id = ${conversationId}
			RETURNING ${column} AS read_seq`,
	);
	return row ? num(row.read_seq) : null;
}

/**
 * Оценка — один раз и только закрытому диалогу. Комментарий — свободный текст
 * покупателя, поэтому шифруется ключом диалога, как и сообщения.
 */
export async function setConversationCsat(
	db: Executor,
	conversation: { id: number; encryptionKey: string },
	score: number,
	comment: string | null,
): Promise<boolean> {
	const encrypted = comment
		? encryptText(
				conversationDataKey(conversation),
				comment,
				aad.csat(conversation.id),
			)
		: null;
	const row = await queryOne(
		db,
		sql`UPDATE support_conversations
			SET csat_score = ${score}, csat_comment = ${encrypted}, updated_at = now()
			WHERE id = ${conversation.id} AND status = 'resolved' AND csat_score IS NULL
			RETURNING id`,
	);
	return row !== null;
}
