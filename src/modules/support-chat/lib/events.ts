import type {
	AgentStatus,
	ConversationPriority,
	ConversationStatus,
	MessageAuthorType,
	MessageKind,
	SupportTopic,
} from "./constants.ts";

/**
 * Протокол шлюза чата: имена событий и формы данных. Общий для сервера
 * (src/modules/support-chat/gateway.ts) и клиентов — виджета и консоли.
 *
 * Все события «клиент → сервер» подтверждаются ack-функцией с
 * `AckResult`: `{ ok: true, data }` или `{ ok: false, error }`. Событие без
 * ack (например, typing) сервер обрабатывает молча.
 */

// ─── Клиент → сервер ────────────────────────────────────────────────────────

export const CLIENT_EVENTS = {
	/** Покупатель: активный диалог и последняя страница сообщений. */
	conversationOpen: "conversation:open",
	messageSend: "message:send",
	conversationRead: "conversation:read",
	typing: "typing",
	/** Сообщения новее известного номера — после разрыва связи. */
	sync: "sync",
	/** Страница сообщений старше номера — прокрутка вверх. */
	history: "history",
	csatSubmit: "csat:submit",

	staffConversationsList: "staff:conversations:list",
	staffConversationGet: "staff:conversation:get",
	staffMessageSend: "staff:message:send",
	staffClaim: "staff:claim",
	staffTransfer: "staff:transfer",
	staffResolve: "staff:resolve",
	staffReopen: "staff:reopen",
	staffSnooze: "staff:snooze",
	staffTags: "staff:tags",
	staffPresence: "staff:presence",
	/** Менеджер открыл диалог в консоли / закрыл его. */
	staffJoin: "staff:join",
	staffLeave: "staff:leave",
	/** «Анна печатает ответ» — для других менеджеров, не для покупателя. */
	staffComposing: "staff:composing",
	staffSuggestions: "staff:suggestions",
	/** Все заготовки менеджера — для команды «/». */
	staffCanned: "staff:canned",
} as const;

// ─── Сервер → клиент ────────────────────────────────────────────────────────

export const SERVER_EVENTS = {
	messageNew: "message:new",
	conversationUpdated: "conversation:updated",
	readUpdated: "read:updated",
	typing: "typing",
	presenceUpdated: "presence:updated",
	viewersUpdated: "viewers:updated",
	composing: "composing",
	/** Подсказки заготовок к новому сообщению покупателя — только персоналу. */
	suggestionsUpdated: "suggestions:updated",
	/** Оценка ответа для покупателя после его сообщения: { conversationId, eta }. */
	etaUpdated: "eta:updated",
	sessionRevoked: "session:revoked",
} as const;

// ─── Ответы ─────────────────────────────────────────────────────────────────

export type SupportErrorCode =
	| "unauthorized"
	| "forbidden"
	| "disabled"
	| "invalid"
	| "not_found"
	| "conflict"
	| "consent_required"
	| "rate_limited"
	| "internal";

export type AckResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: { code: SupportErrorCode; message: string } };

// ─── Данные ─────────────────────────────────────────────────────────────────

export interface MessageContext {
	type: "order" | "product" | "page";
	id?: string | number;
	title?: string;
	url?: string;
}

export interface SupportAttachmentDTO {
	id: number;
	filename: string;
	mimeType: string | null;
	filesize: number | null;
	width: number | null;
	height: number | null;
	/** Относительный адрес: работает и на витрине, и на хосте админки. */
	url: string;
	thumbnailUrl: string | null;
}

/** Публичный документ сайта (Media), приложенный менеджером из заготовки. */
export interface SupportDocumentDTO {
	id: number;
	title: string;
	mimeType: string | null;
	filesize: number | null;
	url: string;
}

export interface SupportPersonDTO {
	name: string;
	avatarUrl: string | null;
}

export interface SupportMessageDTO {
	id: number;
	conversationId: number;
	seq: number;
	authorType: MessageAuthorType;
	kind: MessageKind;
	body: string;
	/** Покупателю — менеджер (имя для покупателей); персоналу — любой автор. */
	author: SupportPersonDTO | null;
	context: MessageContext | null;
	attachments: SupportAttachmentDTO[];
	documents: SupportDocumentDTO[];
	clientMessageId: string | null;
	createdAt: string;
	editedAt: string | null;
	/** Только персоналу. */
	authorAdminId?: number | null;
	cannedResponseId?: number | null;
}

export interface SupportConversationDTO {
	id: number;
	status: ConversationStatus;
	topic: SupportTopic;
	lastSeq: number;
	customerLastReadSeq: number;
	staffLastReadSeq: number;
	assignee: SupportPersonDTO | null;
	lastMessageAt: string | null;
	resolvedAt: string | null;
	csatScore: number | null;
	createdAt: string;
}

export interface StaffConversationDTO
	extends Omit<SupportConversationDTO, "assignee"> {
	assigneeId: number | null;
	assignee: SupportPersonDTO | null;
	priority: ConversationPriority;
	tags: string[];
	snoozedUntil: string | null;
	awaitingReplySince: string | null;
	firstResponseAt: string | null;
	customer: { id: number; name: string; email: string } | null;
	lastMessagePreview: string | null;
	lastMessageAuthorType: MessageAuthorType | null;
}

export interface ConversationPageDTO<C> {
	conversation: C;
	messages: SupportMessageDTO[];
	/** Есть ли сообщения старше первого в странице. */
	hasMore: boolean;
}

export interface AgentPresenceDTO {
	adminId: number;
	name: string;
	status: AgentStatus;
}

/** «Через сколько ответим» — для шапки виджета. */
export interface EtaDTO {
	/** Рабочее ли сейчас время. */
	online: boolean;
	/** Верхняя граница корзины в минутах; вне рабочего времени — null. */
	minutes: number | null;
	/** Ближайшее открытие — вне рабочего времени. */
	nextOpenAt: string | null;
	/** Готовая фраза: часовой пояс поддержки знает только сервер. */
	label: string;
}

export interface CannedSuggestionDTO {
	id: number;
	title: string;
	shortcut: string | null;
	body: string;
	/** Документы заготовки из медиатеки — уходят вместе с текстом. */
	documents: { id: number; title: string }[];
}
