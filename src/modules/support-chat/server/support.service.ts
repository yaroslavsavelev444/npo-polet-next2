import { sql } from "@payloadcms/db-postgres";
import type Redis from "ioredis";
import type { Payload } from "payload";
import {
	HISTORY_PAGE_SIZE,
	type SupportTopic,
	SYNC_MAX_MESSAGES,
} from "../lib/constants.ts";
import {
	type AgentPresenceDTO,
	type CannedSuggestionDTO,
	type ConversationPageDTO,
	type EtaDTO,
	SERVER_EVENTS,
	type StaffConversationDTO,
	type SupportConversationDTO,
	type SupportMessageDTO,
} from "../lib/events.ts";
import type {
	MessageSendInput,
	StaffListInput,
	StaffMessageSendInput,
} from "../lib/schemas.ts";
import { findAssignableAdmin, listAgents } from "./agents.db.ts";
import { type Broadcaster, rooms } from "./broadcast.ts";
import {
	listCannedForStaff,
	markCannedResponseUsed,
	suggestCannedResponses,
} from "./canned-match.ts";
import {
	assignConversation,
	type ConversationRecord,
	claimConversation,
	countAwaitingReply,
	countOpenByAssignee,
	ensureActiveConversation,
	getConversation,
	getLatestConversationForUser,
	lastAssignedAtByAssignee,
	listConversationsForStaff,
	lockConversation,
	markConversationRead,
	reopenConversation,
	resolveConversation,
	setConversationCsat,
	setConversationTags,
	snoozeConversation,
	toCustomerConversationDTO,
	toStaffConversationDTO,
} from "./conversations.db.ts";
import {
	type CustomerContextDTO,
	getCustomerContext,
} from "./customer-context.ts";
import {
	drizzleOf,
	type Executor,
	query,
	queryOne,
	type Row,
	withTransaction,
} from "./db.ts";
import { SupportError } from "./errors.ts";
import { computeEta, currentInterval } from "./eta.ts";
import {
	anonymizeExpired,
	deleteStalePendingAttachments,
	listStaleConversations,
	purgeOrphanFiles,
} from "./maintenance.ts";
import {
	appendMessage,
	findMessageByClientId,
	listMessagesAfter,
	listMessagesBefore,
	loadDocuments,
	toMessageDTOs,
} from "./messages.db.ts";
import { alertStaff, notifyCustomerReply } from "./notify.ts";
import {
	assertCanAccessConversation,
	CHAT_BANNED_MESSAGE,
	type CustomerActor,
	type StaffActor,
	type SupportActor,
} from "./permissions.ts";
import { readPresence } from "./presence.ts";
import { pickAgent } from "./routing.ts";
import { getSupportConfig, isChatOpenForUser } from "./settings.ts";
import { readStats, typicalForNow } from "./stats.ts";

/**
 * Операции чата поддержки — единственное место, где решается, что
 * происходит при каждом действии: что записать, в каком порядке и кому
 * какие события разослать.
 *
 * Правила, которые держит этот файл:
 *
 *  1. Права проверяются здесь, а не только в шлюзе: операции зовут и шлюз,
 *     и HTTP, и воркер.
 *  2. Запись в диалог — в транзакции с блокировкой строки диалога
 *     (см. messages.db.ts о номерах).
 *  3. События рассылаются ПОСЛЕ фиксации транзакции. Событие о сообщении,
 *     которого в базе ещё (или уже) нет, клиент не сможет догрузить.
 *  4. Покупателю — только DTO для покупателя и только в комнату user:{id};
 *     персоналу — в staff (см. broadcast.ts).
 */

export interface SupportDeps {
	payload: Payload;
	broadcaster: Broadcaster;
	redis: Redis;
	/**
	 * Открыт ли у покупателя сокет — то есть видит ли он ответ прямо сейчас.
	 * Знает только шлюз; там, где его нет (HTTP, тесты), колокольчик
	 * «менеджер ответил» не создаётся вовсе — ответы и так идут через шлюз.
	 */
	isUserOnline?: (userId: number) => Promise<boolean>;
}

const SYSTEM_TEXT = {
	assigned: (name: string) => `Вам ответит менеджер: ${name}`,
	transferred: (name: string) => `Диалог передан менеджеру: ${name}`,
	resolved: "Диалог закрыт. Если появятся вопросы — просто напишите сюда.",
} as const;

// ─── Рассылка ───────────────────────────────────────────────────────────────

function emitConversation(
	deps: SupportDeps,
	record: ConversationRecord,
	audience: { customer: boolean; staff: boolean },
): void {
	if (audience.staff) {
		deps.broadcaster
			.to(rooms.staff)
			.emit(SERVER_EVENTS.conversationUpdated, toStaffConversationDTO(record));
	}
	if (audience.customer && record.userId !== null) {
		deps.broadcaster
			.to(rooms.user(record.userId))
			.emit(
				SERVER_EVENTS.conversationUpdated,
				toCustomerConversationDTO(record),
			);
	}
}

/**
 * Разослать новое сообщение. Заметка — только персоналу; остальное —
 * персоналу и покупателю диалога, каждому в своём виде.
 */
async function emitMessage(
	deps: SupportDeps,
	row: Row,
	record: ConversationRecord,
): Promise<{ staff: SupportMessageDTO; customer: SupportMessageDTO | null }> {
	const db = drizzleOf(deps.payload);
	const [staffDTO] = await toMessageDTOs(db, [row], "staff");
	deps.broadcaster.to(rooms.staff).emit(SERVER_EVENTS.messageNew, staffDTO);

	if (staffDTO.kind === "note" || record.userId === null) {
		return { staff: staffDTO, customer: null };
	}
	const [customerDTO] = await toMessageDTOs(db, [row], "customer");
	deps.broadcaster
		.to(rooms.user(record.userId))
		.emit(SERVER_EVENTS.messageNew, customerDTO);
	return { staff: staffDTO, customer: customerDTO };
}

async function requireConversation(
	db: Executor,
	actor: SupportActor,
	conversationId: number,
): Promise<ConversationRecord> {
	const record = await getConversation(db, conversationId);
	assertCanAccessConversation(actor, record);
	return record as ConversationRecord;
}

// ─── Покупатель ─────────────────────────────────────────────────────────────

export interface CustomerOpenResult {
	conversation: SupportConversationDTO | null;
	messages: SupportMessageDTO[];
	hasMore: boolean;
	eta: EtaDTO;
	greeting: string;
}

export async function assertChatOpenForCustomer(
	deps: SupportDeps,
	actor: CustomerActor,
): Promise<void> {
	const config = await getSupportConfig(deps.payload);
	if (!isChatOpenForUser(config, actor.userId)) {
		throw new SupportError("disabled", "Чат с менеджером пока недоступен");
	}
}

/** Что показать в виджете при открытии: текущий диалог, последняя страница, ETA. */
export async function openCustomerConversation(
	deps: SupportDeps,
	actor: CustomerActor,
): Promise<CustomerOpenResult> {
	const db = drizzleOf(deps.payload);
	const config = await getSupportConfig(deps.payload);
	const [record, eta] = await Promise.all([
		getLatestConversationForUser(db, actor.userId),
		getEta(deps),
	]);

	if (!record) {
		return {
			conversation: null,
			messages: [],
			hasMore: false,
			eta,
			greeting: config.texts.greeting,
		};
	}

	const page = await listMessagesBefore(
		db,
		record.id,
		record.lastSeq + 1,
		HISTORY_PAGE_SIZE,
		"customer",
	);
	return {
		conversation: toCustomerConversationDTO(record),
		messages: await toMessageDTOs(db, page.rows, "customer"),
		hasMore: page.hasMore,
		eta,
		greeting: config.texts.greeting,
	};
}

export interface SendResult {
	message: SupportMessageDTO;
	conversation: SupportConversationDTO;
	/** Повтор уже сохранённого сообщения (тот же clientMessageId). */
	duplicate: boolean;
}

export async function sendCustomerMessage(
	deps: SupportDeps,
	actor: CustomerActor,
	input: MessageSendInput,
	meta: { userAgent?: string | null } = {},
): Promise<SendResult> {
	const { payload } = deps;
	if (actor.chatBanned)
		throw new SupportError("forbidden", CHAT_BANNED_MESSAGE);
	const config = await getSupportConfig(payload);
	if (!isChatOpenForUser(config, actor.userId)) {
		throw new SupportError("disabled", "Чат с менеджером пока недоступен");
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		const ensured = await ensureActiveConversation(payload, {
			userId: actor.userId,
			topic: input.topic,
			consent: input.consent,
			userAgent: meta.userAgent,
			reopenWindowDays: config.lifecycle.reopenWindowDays,
		});

		const outcome = await withTransaction(payload, async (tx) => {
			const locked = await lockConversation(tx, ensured.conversationId);
			if (!locked || locked.userId !== actor.userId) {
				throw new SupportError("not_found", "Диалог не найден");
			}

			const existing = await findMessageByClientId(
				tx,
				locked.id,
				input.clientMessageId,
			);
			if (existing) return { row: existing, duplicate: true as const };

			// Менеджер закрыл диалог между выбором и блокировкой — заново:
			// ensureActiveConversation переоткроет его или заведёт новый.
			if (locked.status !== "open") return null;

			const row = await appendMessage(tx, {
				conversationId: locked.id,
				key: locked.key,
				authorType: "customer",
				authorUserId: actor.userId,
				kind: "text",
				body: input.body,
				context: input.context ?? null,
				clientMessageId: input.clientMessageId,
				attachmentIds: input.attachmentIds,
				attachmentsVisibleToUserId: actor.userId,
			});

			await tx.execute(
				sql`UPDATE support_conversations
					SET last_message_at = now(),
						last_customer_message_at = now(),
						awaiting_reply_since = COALESCE(awaiting_reply_since, now()),
						snoozed_until = NULL,
						customer_last_read_seq = GREATEST(customer_last_read_seq, last_seq),
						updated_at = now()
					WHERE id = ${locked.id}`,
			);
			return { row, duplicate: false as const };
		});

		if (!outcome) continue;

		const db = drizzleOf(payload);
		const record = (await getConversation(
			db,
			ensured.conversationId,
		)) as ConversationRecord;

		if (outcome.duplicate) {
			const [message] = await toMessageDTOs(db, [outcome.row], "customer");
			return {
				message,
				conversation: toCustomerConversationDTO(record),
				duplicate: true,
			};
		}

		const { customer } = await emitMessage(deps, outcome.row, record);
		emitConversation(deps, record, { customer: true, staff: true });
		await emitSuggestions(deps, record, input.body);

		const assignedTo =
			record.assigneeId === null && config.routing.mode === "auto"
				? await autoAssign(deps, record.id)
				: record.assigneeId;

		await afterCustomerMessage(deps, record, {
			isNew: ensured.created || ensured.reopened,
			assigned: assignedTo !== null,
		});

		return {
			message: customer as SupportMessageDTO,
			conversation: toCustomerConversationDTO(
				(await getConversation(db, record.id)) as ConversationRecord,
			),
			duplicate: false,
		};
	}

	throw new SupportError(
		"conflict",
		"Не удалось отправить сообщение, повторите попытку",
	);
}

/**
 * Что происходит после сообщения покупателя, кроме самой доставки:
 *
 *  • персональная оценка ответа — покупателю (`eta:updated`);
 *  • вне рабочего времени — один автоответ на «нерабочее окно»: ключ в
 *    Redis живёт до ближайшего открытия, повторные сообщения ночью не
 *    получают по автоответу каждое;
 *  • новый диалог, а на месте никого — письмо персоналу (без текста).
 *
 * Сбой любого шага не должен ронять уже доставленное сообщение.
 */
async function afterCustomerMessage(
	deps: SupportDeps,
	record: ConversationRecord,
	flags: { isNew: boolean; assigned: boolean },
): Promise<void> {
	try {
		const config = await getSupportConfig(deps.payload);
		const eta = await getEta(deps, new Date(), { conversationId: record.id });
		if (record.userId !== null) {
			deps.broadcaster
				.to(rooms.user(record.userId))
				.emit(SERVER_EVENTS.etaUpdated, { conversationId: record.id, eta });
		}

		if (!eta.online && config.texts.offHoursReply) {
			const ttl = eta.nextOpenAt
				? Math.max(
						60,
						Math.ceil((new Date(eta.nextOpenAt).getTime() - Date.now()) / 1000),
					)
				: 12 * 60 * 60;
			const first = await deps.redis.set(
				`support:offhours:${record.id}`,
				"1",
				"EX",
				ttl,
				"NX",
			);
			if (first === "OK") {
				const when = eta.label.replace(/^Сейчас нерабочее время — /, "");
				await appendSystemMessage(
					deps,
					record.id,
					`${config.texts.offHoursReply}\n${when.charAt(0).toUpperCase()}${when.slice(1)}.`,
				);
			}
		}

		// Переоткрытый диалог возвращается прежнему менеджеру — если тот на
		// месте. Нет — сразу другому, не дожидаясь минутного обхода.
		if (
			flags.isNew &&
			record.assigneeId !== null &&
			config.routing.mode === "auto"
		) {
			const agents = await loadAgentState(deps);
			const status = agents.find(
				(agent) => agent.adminId === record.assigneeId,
			)?.status;
			if (status !== "available") {
				await reassignToAnother(deps, record, "прежний менеджер не на месте");
			}
		}

		if (flags.isNew && !flags.assigned) {
			const agents = await loadAgentState(deps);
			if (!agents.some((agent) => agent.status === "available")) {
				await alertStaff(deps.payload, "new", record);
			}
		}
	} catch (error) {
		console.warn("[support-chat] шаги после сообщения не выполнены", {
			conversationId: record.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/** Системное сообщение в диалог (с блокировкой) и рассылка. */
async function appendSystemMessage(
	deps: SupportDeps,
	conversationId: number,
	body: string,
): Promise<void> {
	const row = await withTransaction(deps.payload, async (tx) => {
		const locked = await lockConversation(tx, conversationId);
		if (!locked) return null;
		return appendMessage(tx, {
			conversationId,
			key: locked.key,
			authorType: "system",
			kind: "system",
			body,
		});
	});
	if (!row) return;
	const record = (await getConversation(
		drizzleOf(deps.payload),
		conversationId,
	)) as ConversationRecord;
	await emitMessage(deps, row, record);
	emitConversation(deps, record, { customer: true, staff: true });
}

/** Сообщения новее номера — догрузка после разрыва связи. */
export async function syncMessages(
	deps: SupportDeps,
	actor: SupportActor,
	input: { conversationId: number; afterSeq: number },
): Promise<{ messages: SupportMessageDTO[]; hasMore: boolean }> {
	const db = drizzleOf(deps.payload);
	await requireConversation(db, actor, input.conversationId);
	const audience = actor.kind === "staff" ? "staff" : "customer";
	const rows = await listMessagesAfter(
		db,
		input.conversationId,
		input.afterSeq,
		SYNC_MAX_MESSAGES + 1,
		audience,
	);
	return {
		messages: await toMessageDTOs(
			db,
			rows.slice(0, SYNC_MAX_MESSAGES),
			audience,
		),
		hasMore: rows.length > SYNC_MAX_MESSAGES,
	};
}

/** Страница старше номера — прокрутка истории вверх. */
export async function loadHistory(
	deps: SupportDeps,
	actor: SupportActor,
	input: { conversationId: number; beforeSeq: number },
): Promise<{ messages: SupportMessageDTO[]; hasMore: boolean }> {
	const db = drizzleOf(deps.payload);
	await requireConversation(db, actor, input.conversationId);
	const audience = actor.kind === "staff" ? "staff" : "customer";
	const page = await listMessagesBefore(
		db,
		input.conversationId,
		input.beforeSeq,
		HISTORY_PAGE_SIZE,
		audience,
	);
	return {
		messages: await toMessageDTOs(db, page.rows, audience),
		hasMore: page.hasMore,
	};
}

/**
 * Отметка прочтения. Рассылается обеим сторонам: покупатель видит «прочитано»
 * у своих сообщений, другие вкладки и менеджеры — снятый счётчик.
 */
export async function markRead(
	deps: SupportDeps,
	actor: SupportActor,
	input: { conversationId: number; seq: number },
): Promise<{ seq: number }> {
	const db = drizzleOf(deps.payload);
	const record = await requireConversation(db, actor, input.conversationId);
	const side = actor.kind === "staff" ? "staff" : "customer";
	const seq = (await markConversationRead(db, record.id, side, input.seq)) ?? 0;

	const event = { conversationId: record.id, side, seq };
	deps.broadcaster.to(rooms.staff).emit(SERVER_EVENTS.readUpdated, event);
	if (record.userId !== null) {
		deps.broadcaster
			.to(rooms.user(record.userId))
			.emit(SERVER_EVENTS.readUpdated, event);
	}
	return { seq };
}

/**
 * «Печатает…». Покупатель → всем менеджерам (видно и в списке диалогов);
 * менеджер → покупателю. Ничего не пишется в базу.
 */
export async function relayTyping(
	deps: SupportDeps,
	actor: SupportActor,
	input: { conversationId: number; active: boolean },
): Promise<void> {
	const db = drizzleOf(deps.payload);
	const record = await requireConversation(db, actor, input.conversationId);
	if (actor.kind === "customer") {
		deps.broadcaster.to(rooms.staff).emit(SERVER_EVENTS.typing, {
			conversationId: record.id,
			side: "customer",
			active: input.active,
		});
		return;
	}
	if (record.userId === null) return;
	deps.broadcaster.to(rooms.user(record.userId)).emit(SERVER_EVENTS.typing, {
		conversationId: record.id,
		side: "staff",
		name: actor.name,
		active: input.active,
	});
}

export async function submitCsat(
	deps: SupportDeps,
	actor: CustomerActor,
	input: { conversationId: number; score: number; comment?: string },
): Promise<SupportConversationDTO> {
	const db = drizzleOf(deps.payload);
	const record = await requireConversation(db, actor, input.conversationId);
	const saved = await setConversationCsat(
		db,
		record,
		input.score,
		input.comment?.trim() || null,
	);
	if (!saved) {
		throw new SupportError(
			"conflict",
			"Оценить можно только закрытый диалог, один раз",
		);
	}
	const updated = (await getConversation(db, record.id)) as ConversationRecord;
	emitConversation(deps, updated, { customer: true, staff: true });
	return toCustomerConversationDTO(updated);
}

// ─── Время ответа и распределение ───────────────────────────────────────────

interface AgentLoad {
	adminId: number;
	name: string;
	status: AgentPresenceDTO["status"];
	openCount: number;
	topics: SupportTopic[];
	lastAssignedAt: number | null;
}

async function loadAgentState(deps: SupportDeps): Promise<AgentLoad[]> {
	const db = drizzleOf(deps.payload);
	const [agents, presence, counts, lastAssigned] = await Promise.all([
		listAgents(db),
		readPresence(deps.redis),
		countOpenByAssignee(db),
		lastAssignedAtByAssignee(db),
	]);
	return agents.map((agent) => ({
		adminId: agent.adminId,
		name: agent.name,
		status: presence.get(agent.adminId) ?? "offline",
		openCount: counts.get(agent.adminId) ?? 0,
		topics: agent.topics,
		lastAssignedAt: lastAssigned.get(agent.adminId) ?? null,
	}));
}

/**
 * Оценка «через сколько ответим». С `conversationId` — персональная: вместо
 * всей очереди учитываются только диалоги, ждущие дольше этого (место в
 * очереди), — её покупатель видит сразу после отправки сообщения.
 */
export async function getEta(
	deps: SupportDeps,
	now: Date = new Date(),
	options: { conversationId?: number } = {},
): Promise<EtaDTO> {
	const config = await getSupportConfig(deps.payload);
	const db = drizzleOf(deps.payload);
	const [agents, queueDepth, stats] = await Promise.all([
		loadAgentState(deps),
		options.conversationId
			? queuePosition(db, options.conversationId)
			: countAwaitingReply(db),
		readStats(deps.redis),
	]);
	return computeEta({
		now,
		config,
		availableAgents: agents.filter((agent) => agent.status === "available")
			.length,
		queueDepth,
		typicalFirstResponseMinutes: typicalForNow(stats, config, now),
	});
}

/** Сколько диалогов ждут ответа дольше этого (вместе с ним самим). */
async function queuePosition(
	db: Executor,
	conversationId: number,
): Promise<number> {
	const row = await queryOne(
		db,
		sql`SELECT count(*)::int AS n
			FROM support_conversations other, support_conversations me
			WHERE me.id = ${conversationId}
				AND me.awaiting_reply_since IS NOT NULL
				AND other.status = 'open'
				AND other.awaiting_reply_since IS NOT NULL
				AND (other.snoozed_until IS NULL OR other.snoozed_until <= now())
				AND other.awaiting_reply_since <= me.awaiting_reply_since`,
	);
	return Number(row?.n ?? 0);
}

export async function listAgentPresence(
	deps: SupportDeps,
): Promise<AgentPresenceDTO[]> {
	const agents = await loadAgentState(deps);
	return agents.map(({ adminId, name, status }) => ({ adminId, name, status }));
}

/**
 * Назначить диалог и сообщить покупателю, кто ему ответит. Назначение и
 * системное сообщение — одной транзакцией: покупатель не увидит «Вам ответит
 * Анна», если назначение не состоялось, и наоборот.
 *
 * `onlyIfUnassigned` — режим «Взять» и автораспределения: проигравший в
 * гонке получает false. Передача (transfer) переназначает безусловно.
 */
async function assignWithAnnouncement(
	deps: SupportDeps,
	conversationId: number,
	assignee: { adminId: number; name: string },
	options: {
		onlyIfUnassigned: boolean;
		announcement: string;
		note?: { authorAdminId: number; body: string };
	},
): Promise<ConversationRecord | null> {
	const result = await withTransaction(deps.payload, async (tx) => {
		const locked = await lockConversation(tx, conversationId);
		if (!locked || locked.status !== "open") return null;

		if (options.onlyIfUnassigned) {
			if (!(await claimConversation(tx, conversationId, assignee.adminId)))
				return null;
		} else {
			await assignConversation(tx, conversationId, assignee.adminId);
		}

		const rows: Row[] = [];
		if (options.note?.body) {
			rows.push(
				await appendMessage(tx, {
					conversationId,
					key: locked.key,
					authorType: "staff",
					authorAdminId: options.note.authorAdminId,
					kind: "note",
					body: options.note.body,
				}),
			);
		}
		rows.push(
			await appendMessage(tx, {
				conversationId,
				key: locked.key,
				authorType: "system",
				kind: "system",
				body: options.announcement,
			}),
		);
		return rows;
	});
	if (!result) return null;

	const record = (await getConversation(
		drizzleOf(deps.payload),
		conversationId,
	)) as ConversationRecord;
	for (const row of result) await emitMessage(deps, row, record);
	emitConversation(deps, record, { customer: true, staff: true });
	return record;
}

/**
 * Автораспределение: свободному менеджеру на месте (см. routing.ts). Никого
 * нет — диалог остаётся в общей очереди, его видят все менеджеры.
 */
export async function autoAssign(
	deps: SupportDeps,
	conversationId: number,
): Promise<number | null> {
	const db = drizzleOf(deps.payload);
	const record = await getConversation(db, conversationId);
	if (!record || record.status !== "open" || record.assigneeId !== null)
		return null;

	const agents = await loadAgentState(deps);
	const adminId = pickAgent(agents, record.topic);
	if (adminId === null) return null;

	const agent = agents.find((candidate) => candidate.adminId === adminId);
	if (!agent) return null;
	const assigned = await assignWithAnnouncement(deps, conversationId, agent, {
		onlyIfUnassigned: true,
		announcement: SYSTEM_TEXT.assigned(agent.name),
	});
	return assigned ? adminId : null;
}

// ─── Персонал ───────────────────────────────────────────────────────────────

export async function listForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	input: StaffListInput,
): Promise<StaffConversationDTO[]> {
	const records = await listConversationsForStaff(drizzleOf(deps.payload), {
		tab: input.tab,
		adminId: actor.adminId,
		before: input.before,
		limit: input.limit,
	});
	return records.map(toStaffConversationDTO);
}

export async function getForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	conversationId: number,
): Promise<ConversationPageDTO<StaffConversationDTO>> {
	const db = drizzleOf(deps.payload);
	const record = await requireConversation(db, actor, conversationId);
	const page = await listMessagesBefore(
		db,
		record.id,
		record.lastSeq + 1,
		HISTORY_PAGE_SIZE,
		"staff",
	);
	return {
		conversation: toStaffConversationDTO(record),
		messages: await toMessageDTOs(db, page.rows, "staff"),
		hasMore: page.hasMore,
	};
}

export async function sendStaffMessage(
	deps: SupportDeps,
	actor: StaffActor,
	input: StaffMessageSendInput,
): Promise<{ message: SupportMessageDTO; duplicate: boolean }> {
	const { payload } = deps;

	const documentIds = [...new Set(input.documentIds ?? [])];
	if (documentIds.length > 0) {
		const found = await loadDocuments(drizzleOf(payload), documentIds);
		if (found.size !== documentIds.length) {
			throw new SupportError("invalid", "Документ не найден в медиатеке");
		}
	}

	const outcome = await withTransaction(payload, async (tx) => {
		const locked = await lockConversation(tx, input.conversationId);
		if (!locked) throw new SupportError("not_found", "Диалог не найден");

		const existing = await findMessageByClientId(
			tx,
			locked.id,
			input.clientMessageId,
		);
		if (existing) return { row: existing, duplicate: true as const };

		const isReply = input.kind === "text";
		if (isReply && locked.status !== "open") {
			throw new SupportError(
				"conflict",
				"Диалог закрыт — переоткройте его, чтобы ответить",
			);
		}
		if (isReply && locked.userId === null) {
			throw new SupportError(
				"conflict",
				"Аккаунт покупателя удалён — ответ некому доставить",
			);
		}

		// Ответ из очереди забирает диалог себе: отвечающий и есть ответственный.
		if (isReply && locked.assigneeId === null) {
			await assignConversation(tx, locked.id, actor.adminId);
		}

		const row = await appendMessage(tx, {
			conversationId: locked.id,
			key: locked.key,
			authorType: "staff",
			authorAdminId: actor.adminId,
			kind: input.kind,
			body: input.body,
			clientMessageId: input.clientMessageId,
			cannedResponseId: input.cannedResponseId ?? null,
			attachmentIds: input.attachmentIds,
			mediaIds: documentIds,
			attachmentsVisibleToUserId: isReply ? locked.userId : null,
		});

		await tx.execute(
			isReply
				? sql`UPDATE support_conversations
					SET last_message_at = now(),
						last_staff_message_at = now(),
						awaiting_reply_since = NULL,
						first_response_at = COALESCE(first_response_at, now()),
						staff_last_read_seq = GREATEST(staff_last_read_seq, last_seq),
						updated_at = now()
					WHERE id = ${locked.id}`
				: sql`UPDATE support_conversations
					SET staff_last_read_seq = GREATEST(staff_last_read_seq, last_seq),
						updated_at = now()
					WHERE id = ${locked.id}`,
		);

		if (isReply && input.cannedResponseId) {
			await markCannedResponseUsed(tx, input.cannedResponseId);
		}
		return { row, duplicate: false as const };
	});

	const db = drizzleOf(payload);
	if (outcome.duplicate) {
		const [message] = await toMessageDTOs(db, [outcome.row], "staff");
		return { message, duplicate: true };
	}

	const record = (await getConversation(
		db,
		input.conversationId,
	)) as ConversationRecord;
	const { staff } = await emitMessage(deps, outcome.row, record);
	emitConversation(deps, record, {
		customer: input.kind === "text",
		staff: true,
	});

	// Покупатель не на сайте — колокольчик, чтобы ответ не потерялся.
	if (input.kind === "text" && record.userId !== null && deps.isUserOnline) {
		const online = await deps.isUserOnline(record.userId).catch(() => true);
		if (!online)
			await notifyCustomerReply(deps.payload, record.userId, record.id);
	}
	return { message: staff, duplicate: false };
}

export async function claimForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	conversationId: number,
): Promise<StaffConversationDTO> {
	const db = drizzleOf(deps.payload);
	await requireConversation(db, actor, conversationId);

	const record = await assignWithAnnouncement(
		deps,
		conversationId,
		{ adminId: actor.adminId, name: actor.name },
		{ onlyIfUnassigned: true, announcement: SYSTEM_TEXT.assigned(actor.name) },
	);
	if (record) return toStaffConversationDTO(record);

	const current = (await getConversation(
		db,
		conversationId,
	)) as ConversationRecord;
	if (current.status !== "open") {
		throw new SupportError("conflict", "Диалог закрыт");
	}
	if (current.assigneeId === actor.adminId)
		return toStaffConversationDTO(current);
	throw new SupportError(
		"conflict",
		`Диалог уже взял менеджер ${current.assignee?.name ?? ""}`.trim(),
	);
}

export async function transferForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	input: { conversationId: number; toAdminId: number; note?: string },
): Promise<StaffConversationDTO> {
	const db = drizzleOf(deps.payload);
	await requireConversation(db, actor, input.conversationId);

	const target = await findAssignableAdmin(db, input.toAdminId);
	if (!target)
		throw new SupportError("invalid", "Этот сотрудник не работает в чате");

	const record = await assignWithAnnouncement(
		deps,
		input.conversationId,
		target,
		{
			onlyIfUnassigned: false,
			announcement: SYSTEM_TEXT.transferred(target.name),
			note: input.note
				? { authorAdminId: actor.adminId, body: input.note }
				: undefined,
		},
	);
	if (!record)
		throw new SupportError("conflict", "Закрытый диалог передать нельзя");
	return toStaffConversationDTO(record);
}

export async function resolveForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	conversationId: number,
): Promise<StaffConversationDTO> {
	const db = drizzleOf(deps.payload);
	await requireConversation(db, actor, conversationId);

	const row = await withTransaction(deps.payload, async (tx) => {
		const locked = await lockConversation(tx, conversationId);
		if (!locked || !(await resolveConversation(tx, conversationId)))
			return null;
		return appendMessage(tx, {
			conversationId,
			key: locked.key,
			authorType: "system",
			kind: "system",
			body: SYSTEM_TEXT.resolved,
		});
	});
	if (!row) throw new SupportError("conflict", "Диалог уже закрыт");

	const record = (await getConversation(
		db,
		conversationId,
	)) as ConversationRecord;
	await emitMessage(deps, row, record);
	emitConversation(deps, record, { customer: true, staff: true });
	return toStaffConversationDTO(record);
}

export async function reopenForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	conversationId: number,
): Promise<StaffConversationDTO> {
	const db = drizzleOf(deps.payload);
	await requireConversation(db, actor, conversationId);
	if (!(await reopenConversation(db, conversationId))) {
		throw new SupportError("conflict", "Диалог уже открыт");
	}
	const record = (await getConversation(
		db,
		conversationId,
	)) as ConversationRecord;
	emitConversation(deps, record, { customer: true, staff: true });
	return toStaffConversationDTO(record);
}

export async function snoozeForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	input: { conversationId: number; until: string },
): Promise<StaffConversationDTO> {
	if (new Date(input.until).getTime() <= Date.now()) {
		throw new SupportError("invalid", "Время должно быть в будущем");
	}
	const db = drizzleOf(deps.payload);
	await requireConversation(db, actor, input.conversationId);
	if (!(await snoozeConversation(db, input.conversationId, input.until))) {
		throw new SupportError("conflict", "Отложить можно только открытый диалог");
	}
	const record = (await getConversation(
		db,
		input.conversationId,
	)) as ConversationRecord;
	emitConversation(deps, record, { customer: false, staff: true });
	return toStaffConversationDTO(record);
}

export async function setTagsForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	input: { conversationId: number; tags: string[] },
): Promise<StaffConversationDTO> {
	const db = drizzleOf(deps.payload);
	await requireConversation(db, actor, input.conversationId);
	await withTransaction(deps.payload, (tx) =>
		setConversationTags(tx, input.conversationId, input.tags),
	);
	const record = (await getConversation(
		db,
		input.conversationId,
	)) as ConversationRecord;
	emitConversation(deps, record, { customer: false, staff: true });
	return toStaffConversationDTO(record);
}

/** Подсказки заготовок к тексту (обычно — к последнему сообщению покупателя). */
export async function suggestionsForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	input: { conversationId: number; text: string },
): Promise<CannedSuggestionDTO[]> {
	const db = drizzleOf(deps.payload);
	const record = await requireConversation(db, actor, input.conversationId);
	return suggestCannedResponses(db, {
		text: input.text,
		topic: record.topic,
		adminId: actor.adminId,
		includePersonal: true,
	});
}

/** Все заготовки менеджера — для команды «/» в консоли. */
export async function cannedForStaff(
	deps: SupportDeps,
	actor: StaffActor,
): Promise<CannedSuggestionDTO[]> {
	return listCannedForStaff(drizzleOf(deps.payload), actor.adminId);
}

/**
 * Подсказки к новому сообщению покупателя — всем менеджерам сразу, без
 * запроса: консоль показывает их над полем ввода, как только диалог открыт.
 * Только общие заготовки (личные адресованы одному менеджеру и приходят
 * по его запросу). Сбой подбора не должен мешать доставке сообщения.
 */
async function emitSuggestions(
	deps: SupportDeps,
	record: ConversationRecord,
	text: string,
): Promise<void> {
	if (!text.trim()) return;
	try {
		const suggestions = await suggestCannedResponses(drizzleOf(deps.payload), {
			text,
			topic: record.topic,
			adminId: 0,
			includePersonal: false,
		});
		if (suggestions.length === 0) return;
		deps.broadcaster.to(rooms.staff).emit(SERVER_EVENTS.suggestionsUpdated, {
			conversationId: record.id,
			suggestions,
		});
	} catch (error) {
		console.warn("[support-chat] подсказки не подобраны", {
			conversationId: record.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/**
 * Разобрать общую очередь: менеджер стал «на месте» — ему (и другим
 * свободным) раздаются ждущие диалоги, начиная с самого давнего. Останавливается,
 * когда свободных мест не осталось.
 */
export async function drainQueue(
	deps: SupportDeps,
	limit = 20,
): Promise<number> {
	const config = await getSupportConfig(deps.payload);
	if (config.routing.mode !== "auto") return 0;

	const queue = await listConversationsForStaff(drizzleOf(deps.payload), {
		tab: "queue",
		adminId: 0,
		limit,
	});
	let assigned = 0;
	for (const record of queue) {
		if ((await autoAssign(deps, record.id)) === null) break;
		assigned++;
	}
	return assigned;
}

// ─── Для HTTP ───────────────────────────────────────────────────────────────

/** История диалогов покупателя — без превью: последнее сообщение может быть заметкой. */
export async function listCustomerConversations(
	deps: SupportDeps,
	actor: CustomerActor,
): Promise<SupportConversationDTO[]> {
	const rows = await query(
		drizzleOf(deps.payload),
		sql`SELECT id FROM support_conversations
			WHERE user_id = ${actor.userId}
			ORDER BY created_at DESC LIMIT 50`,
	);
	const db = drizzleOf(deps.payload);
	const records = await Promise.all(
		rows.map((row) => getConversation(db, Number(row.id))),
	);
	return records
		.filter((record): record is ConversationRecord => record !== null)
		.map(toCustomerConversationDTO);
}

/**
 * Непрочитанные покупателем ответы — для значка на кнопке чата без открытия
 * сокета. Считаются сообщения менеджеров и системы новее отметки прочтения
 * во всех диалогах покупателя (заметки не в счёт).
 */
export async function customerUnreadCount(
	deps: SupportDeps,
	actor: CustomerActor,
): Promise<number> {
	const row = await queryOne(
		drizzleOf(deps.payload),
		sql`SELECT count(*)::int AS n
			FROM support_messages m
			JOIN support_conversations c ON c.id = m.conversation_id
			WHERE c.user_id = ${actor.userId}
				AND m.author_type IN ('staff', 'system')
				AND m.kind <> 'note'
				AND m.seq > c.customer_last_read_seq`,
	);
	return Number(row?.n ?? 0);
}

export interface StaffSummaryDTO {
	/** В общей очереди без менеджера. */
	queue: number;
	/** Назначены мне и ждут ответа. */
	mineAwaiting: number;
	/** Всего ждут ответа. */
	awaiting: number;
}

/** Счётчики для пункта меню админки — опросом, без сокета. */
export async function staffSummary(
	deps: SupportDeps,
	actor: StaffActor,
): Promise<StaffSummaryDTO> {
	const row = await queryOne(
		drizzleOf(deps.payload),
		sql`SELECT
				count(*) FILTER (WHERE assignee_id IS NULL)::int AS queue,
				count(*) FILTER (WHERE assignee_id = ${actor.adminId}
					AND awaiting_reply_since IS NOT NULL)::int AS mine_awaiting,
				count(*) FILTER (WHERE awaiting_reply_since IS NOT NULL)::int AS awaiting
			FROM support_conversations
			WHERE status = 'open' AND (snoozed_until IS NULL OR snoozed_until <= now())`,
	);
	return {
		queue: Number(row?.queue ?? 0),
		mineAwaiting: Number(row?.mine_awaiting ?? 0),
		awaiting: Number(row?.awaiting ?? 0),
	};
}

export interface SupportLiveDTO {
	/** Рабочее ли сейчас время и какой срок ответа действует. */
	open: boolean;
	slaMinutes: number;
	queue: number;
	awaiting: number;
	/** Ждут дольше срока. */
	overdue: number;
	/** Самое долгое ожидание ответа, минуты; null — никто не ждёт. */
	longestWaitMinutes: number | null;
	agents: (AgentPresenceDTO & { openCount: number })[];
}

/** Живая панель отчётов: очередь сейчас, самое долгое ожидание, кто на месте. */
export async function supportLive(
	deps: SupportDeps,
	now: Date = new Date(),
): Promise<SupportLiveDTO> {
	const config = await getSupportConfig(deps.payload);
	const interval = currentInterval(now, config);
	const slaMinutes =
		interval?.slaMinutes ?? config.routing.firstResponseSlaMinutes;
	const [row, agents] = await Promise.all([
		queryOne(
			drizzleOf(deps.payload),
			sql`SELECT
					count(*) FILTER (WHERE assignee_id IS NULL)::int AS queue,
					count(*) FILTER (WHERE awaiting_reply_since IS NOT NULL)::int AS awaiting,
					count(*) FILTER (WHERE awaiting_reply_since
						< ${now.toISOString()}::timestamptz - make_interval(mins => ${slaMinutes}))::int AS overdue,
					min(awaiting_reply_since) AS oldest
				FROM support_conversations
				WHERE status = 'open' AND (snoozed_until IS NULL OR snoozed_until <= now())`,
		),
		loadAgentState(deps),
	]);
	const oldest = row?.oldest ? new Date(String(row.oldest)) : null;
	return {
		open: interval !== null,
		slaMinutes,
		queue: Number(row?.queue ?? 0),
		awaiting: Number(row?.awaiting ?? 0),
		overdue: Number(row?.overdue ?? 0),
		longestWaitMinutes: oldest
			? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 60_000))
			: null,
		agents: agents
			.map(({ adminId, name, status, openCount }) => ({
				adminId,
				name,
				status,
				openCount,
			}))
			.sort(
				(a, b) =>
					STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
					a.name.localeCompare(b.name, "ru"),
			),
	};
}

const STATUS_ORDER: Record<AgentPresenceDTO["status"], number> = {
	available: 0,
	away: 1,
	offline: 2,
};

export async function customerContextForStaff(
	deps: SupportDeps,
	actor: StaffActor,
	conversationId: number,
): Promise<CustomerContextDTO | null> {
	const record = await requireConversation(
		drizzleOf(deps.payload),
		actor,
		conversationId,
	);
	return getCustomerContext(deps.payload, record);
}

// ─── Срок ответа: переназначение и эскалация ────────────────────────────────

const AUTO_REASSIGN_NOTE = (from: string, minutes: number, why: string) =>
	`Передан автоматически от ${from}: ${why} (покупатель ждёт ${minutes} мин).`;

/**
 * Передать диалог другому менеджеру на месте. Текущего исключаем из выбора;
 * никого нет — ничего не делаем (дальше сработает эскалация письмом).
 */
export async function reassignToAnother(
	deps: SupportDeps,
	record: ConversationRecord,
	reason: string,
): Promise<number | null> {
	const agents = await loadAgentState(deps);
	const others = agents.filter((agent) => agent.adminId !== record.assigneeId);
	const adminId = pickAgent(others, record.topic);
	if (adminId === null) return null;
	const target = others.find((agent) => agent.adminId === adminId);
	if (!target) return null;

	const minutes = record.awaitingReplySince
		? Math.round(
				(Date.now() - new Date(record.awaitingReplySince).getTime()) / 60_000,
			)
		: 0;
	const assigned = await assignWithAnnouncement(deps, record.id, target, {
		onlyIfUnassigned: false,
		announcement: SYSTEM_TEXT.assigned(target.name),
		note: record.assigneeId
			? {
					authorAdminId: record.assigneeId,
					body: AUTO_REASSIGN_NOTE(
						record.assignee?.name ?? "менеджера",
						minutes,
						reason,
					),
				}
			: undefined,
	});
	return assigned ? adminId : null;
}

export interface SweepResult {
	reassigned: number;
	queued: number;
	escalated: number;
}

/**
 * Обход ждущих диалогов — раз в минуту (периодические задачи шлюза).
 *
 *  1. Назначенный менеджер не на месте (отошёл, закрыл консоль) — диалог
 *     сразу уходит тому, кто на месте.
 *  2. Назначенный на месте, но молчит дольше «Вернуть в очередь, если
 *     назначенный молчит» — тоже передаётся. Отсчёт — от более позднего из
 *     «ждёт с» и «назначен»: только что переданный диалог не перекидывается
 *     дальше, пока у нового менеджера не прошёл тот же срок.
 *  3. Очередь без менеджера раздаётся (drainQueue).
 *  4. Покупатель ждёт дольше срока ответа — письмо персоналу, один раз на
 *     каждое ожидание (ключ в Redis по диалогу и моменту «ждёт с»).
 *
 * Только в рабочее время: ночью никто не на месте, и перекладывать диалоги
 * между отсутствующими бессмысленно.
 */
export async function sweepAwaiting(
	deps: SupportDeps,
	now: Date = new Date(),
): Promise<SweepResult> {
	const result: SweepResult = { reassigned: 0, queued: 0, escalated: 0 };
	const config = await getSupportConfig(deps.payload);
	const interval = currentInterval(now, config);
	if (!interval) return result;

	const db = drizzleOf(deps.payload);
	const awaiting = await listConversationsForStaff(db, {
		tab: "open",
		adminId: 0,
		limit: 500,
	});
	const agents = await loadAgentState(deps);
	const statusOf = new Map(
		agents.map((agent) => [agent.adminId, agent.status]),
	);
	const reassignAfter = config.routing.reassignAfterMinutes;
	const sla = interval.slaMinutes ?? config.routing.firstResponseSlaMinutes;

	for (const record of awaiting) {
		if (!record.awaitingReplySince) continue;
		const waited =
			(now.getTime() - new Date(record.awaitingReplySince).getTime()) / 60_000;

		if (config.routing.mode === "auto" && record.assigneeId !== null) {
			const status = statusOf.get(record.assigneeId) ?? "offline";
			const since = Math.max(
				new Date(record.awaitingReplySince).getTime(),
				record.assignedAt ? new Date(record.assignedAt).getTime() : 0,
			);
			const silentFor = (now.getTime() - since) / 60_000;
			const reason =
				status !== "available"
					? status === "away"
						? "менеджер отошёл"
						: "менеджер не в сети"
					: silentFor >= reassignAfter
						? `нет ответа ${Math.round(silentFor)} мин`
						: null;
			if (reason && (await reassignToAnother(deps, record, reason)) !== null) {
				result.reassigned++;
				continue;
			}
		}

		if (waited >= sla) {
			const key = `support:escalated:${record.id}:${record.awaitingReplySince}`;
			const first = await deps.redis.set(
				key,
				"1",
				"EX",
				3 * 24 * 60 * 60,
				"NX",
			);
			if (first === "OK") {
				await alertStaff(deps.payload, "overdue", record, Math.round(waited));
				result.escalated++;
			}
		}
	}

	if (config.routing.mode === "auto") result.queued = await drainQueue(deps);
	return result;
}

// ─── Обслуживание ───────────────────────────────────────────────────────────

const AUTO_CLOSED_TEXT =
	"Диалог закрыт автоматически: давно не было новых сообщений. Если вопрос остался — просто напишите сюда.";

/**
 * Закрыть диалог от имени системы — с сообщением покупателю, как при
 * закрытии менеджером. false — уже закрыт или изменился.
 */
async function resolveAsSystem(
	deps: SupportDeps,
	conversationId: number,
): Promise<boolean> {
	const row = await withTransaction(deps.payload, async (tx) => {
		const locked = await lockConversation(tx, conversationId);
		if (!locked || !(await resolveConversation(tx, conversationId)))
			return null;
		return appendMessage(tx, {
			conversationId,
			key: locked.key,
			authorType: "system",
			kind: "system",
			body: AUTO_CLOSED_TEXT,
		});
	});
	if (!row) return false;
	const record = (await getConversation(
		drizzleOf(deps.payload),
		conversationId,
	)) as ConversationRecord;
	await emitMessage(deps, row, record);
	emitConversation(deps, record, { customer: true, staff: true });
	return true;
}

export interface MaintenanceResult {
	autoClosed: number;
	anonymized: number;
	pendingAttachments: number;
	orphanFiles: number;
}

/**
 * Ежечасное обслуживание (periodic.ts):
 *  1. Закрыть диалоги, где последнее слово за менеджером и покупатель молчит
 *     дольше «Закрывать после ответа менеджера и тишины» — так очередь и
 *     «Все открытые» не зарастают отвеченными вопросами.
 *  2. Обезличить переписку старше срока хранения (3 года).
 *  3. Удалить неотправленные вложения старше суток и файлы без записи.
 */
export async function runMaintenance(
	deps: SupportDeps,
): Promise<MaintenanceResult> {
	const db = drizzleOf(deps.payload);
	const config = await getSupportConfig(deps.payload);

	let autoClosed = 0;
	for (const id of await listStaleConversations(
		db,
		config.lifecycle.autoCloseAfterDays,
	)) {
		if (await resolveAsSystem(deps, id)) autoClosed++;
	}

	const anonymized = await withTransaction(deps.payload, (tx) =>
		anonymizeExpired(tx),
	);
	const pendingAttachments = await deleteStalePendingAttachments(db);
	const orphanFiles = await purgeOrphanFiles(db);
	return { autoClosed, anonymized, pendingAttachments, orphanFiles };
}
