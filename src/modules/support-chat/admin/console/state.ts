import type {
	AgentPresenceDTO,
	CannedSuggestionDTO,
	StaffConversationDTO,
	SupportMessageDTO,
} from "../../lib/events";

/**
 * Состояние консоли — чистый редьюсер, без сокета и DOM. Сокет только
 * превращает события сервера в действия (useConsole.ts).
 *
 * Сервер — источник истины, клиент лишь собирает картину из событий:
 * любое событие можно получить дважды (повтор после переподключения), поэтому
 * все слияния идемпотентны — по id сообщения, по номеру, по «новее/старее».
 */

export type StaffTab = "mine" | "queue" | "open" | "snoozed" | "resolved";

export interface PendingMessage {
	clientMessageId: string;
	conversationId: number;
	body: string;
	kind: "text" | "note";
	error: string | null;
}

export interface ConsoleState {
	connection: "connecting" | "online" | "offline" | "revoked";
	tab: StaffTab;
	conversations: Record<number, StaffConversationDTO>;
	/** id диалогов текущей вкладки в порядке сервера (дальше пересортировка). */
	tabIds: number[];
	selectedId: number | null;
	messages: Record<number, SupportMessageDTO[]>;
	hasMore: Record<number, boolean>;
	pending: PendingMessage[];
	/** Покупатель печатает: conversationId → до какого момента показывать. */
	customerTyping: Record<number, number>;
	/** Другие менеджеры пишут ответ: conversationId → кто и до какого момента. */
	composing: Record<number, { adminId: number; name: string; until: number }[]>;
	viewers: Record<number, number[]>;
	suggestions: Record<number, CannedSuggestionDTO[]>;
	agents: AgentPresenceDTO[];
}

export const initialState = (selectedId: number | null): ConsoleState => ({
	connection: "connecting",
	tab: "mine",
	conversations: {},
	tabIds: [],
	selectedId,
	messages: {},
	hasMore: {},
	pending: [],
	customerTyping: {},
	composing: {},
	viewers: {},
	suggestions: {},
	agents: [],
});

export type ConsoleAction =
	| { type: "connection"; status: ConsoleState["connection"] }
	| { type: "tab"; tab: StaffTab }
	| {
			type: "list";
			tab: StaffTab;
			conversations: StaffConversationDTO[];
			append: boolean;
	  }
	| { type: "select"; id: number | null }
	| { type: "conversation"; conversation: StaffConversationDTO }
	| {
			type: "page";
			conversation: StaffConversationDTO;
			messages: SupportMessageDTO[];
			hasMore: boolean;
	  }
	| {
			type: "older";
			conversationId: number;
			messages: SupportMessageDTO[];
			hasMore: boolean;
	  }
	| { type: "messages"; messages: SupportMessageDTO[] }
	| { type: "pending"; message: PendingMessage }
	| { type: "pendingFailed"; clientMessageId: string; error: string }
	| { type: "pendingDrop"; clientMessageId: string }
	| {
			type: "read";
			conversationId: number;
			side: "customer" | "staff";
			seq: number;
	  }
	| { type: "customerTyping"; conversationId: number; active: boolean }
	| {
			type: "composing";
			conversationId: number;
			adminId: number;
			name: string;
			active: boolean;
	  }
	| { type: "viewers"; conversationId: number; adminIds: number[] }
	| {
			type: "suggestions";
			conversationId: number;
			suggestions: CannedSuggestionDTO[];
	  }
	| { type: "agents"; agents: AgentPresenceDTO[] }
	| { type: "expire"; now: number };

const TYPING_TTL_MS = 6_000;

function isSnoozed(c: StaffConversationDTO, now: number): boolean {
	return c.snoozedUntil !== null && new Date(c.snoozedUntil).getTime() > now;
}

/** Тот же отбор, что делает сервер для вкладки (conversations.db.ts). */
export function belongsToTab(
	c: StaffConversationDTO,
	tab: StaffTab,
	myAdminId: number,
	now = Date.now(),
): boolean {
	switch (tab) {
		case "mine":
			return (
				c.status === "open" && c.assigneeId === myAdminId && !isSnoozed(c, now)
			);
		case "queue":
			return c.status === "open" && c.assigneeId === null && !isSnoozed(c, now);
		case "open":
			return c.status === "open" && !isSnoozed(c, now);
		case "snoozed":
			return c.status === "open" && isSnoozed(c, now);
		case "resolved":
			return c.status === "resolved";
	}
}

const time = (value: string | null) =>
	value ? new Date(value).getTime() : null;

/** «Дольше всех ждёт — выше», затем свежее; закрытые — свежее выше. */
export function compareForTab(tab: StaffTab) {
	return (a: StaffConversationDTO, b: StaffConversationDTO): number => {
		if (tab !== "resolved" && tab !== "snoozed") {
			const wa = time(a.awaitingReplySince);
			const wb = time(b.awaitingReplySince);
			if (wa !== wb) {
				if (wa === null) return 1;
				if (wb === null) return -1;
				return wa - wb;
			}
		}
		return (
			(time(b.lastMessageAt) ?? 0) - (time(a.lastMessageAt) ?? 0) || b.id - a.id
		);
	};
}

export function isUnreadForStaff(c: StaffConversationDTO): boolean {
	return (
		c.lastMessageAuthorType === "customer" && c.staffLastReadSeq < c.lastSeq
	);
}

function mergeMessages(
	current: SupportMessageDTO[] | undefined,
	incoming: SupportMessageDTO[],
): SupportMessageDTO[] {
	const byId = new Map((current ?? []).map((m) => [m.id, m]));
	for (const message of incoming) byId.set(message.id, message);
	return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

export function reducer(
	state: ConsoleState,
	action: ConsoleAction,
	myAdminId: number,
): ConsoleState {
	switch (action.type) {
		case "connection":
			return { ...state, connection: action.status };

		case "tab":
			return { ...state, tab: action.tab, tabIds: [] };

		case "list": {
			if (action.tab !== state.tab) return state;
			const conversations = { ...state.conversations };
			for (const c of action.conversations) conversations[c.id] = c;
			const ids = action.append
				? [
						...new Set([
							...state.tabIds,
							...action.conversations.map((c) => c.id),
						]),
					]
				: action.conversations.map((c) => c.id);
			return { ...state, conversations, tabIds: ids };
		}

		case "select":
			return { ...state, selectedId: action.id };

		case "conversation": {
			const c = action.conversation;
			const conversations = { ...state.conversations, [c.id]: c };
			const inTab = belongsToTab(c, state.tab, myAdminId);
			const has = state.tabIds.includes(c.id);
			const tabIds = inTab
				? has
					? state.tabIds
					: [...state.tabIds, c.id]
				: state.tabIds.filter((id) => id !== c.id);
			return { ...state, conversations, tabIds };
		}

		case "page": {
			const c = action.conversation;
			return {
				...state,
				conversations: { ...state.conversations, [c.id]: c },
				messages: {
					...state.messages,
					[c.id]: mergeMessages(undefined, action.messages),
				},
				hasMore: { ...state.hasMore, [c.id]: action.hasMore },
			};
		}

		case "older":
			return {
				...state,
				messages: {
					...state.messages,
					[action.conversationId]: mergeMessages(
						state.messages[action.conversationId],
						action.messages,
					),
				},
				hasMore: { ...state.hasMore, [action.conversationId]: action.hasMore },
			};

		case "messages": {
			const messages = { ...state.messages };
			let pending = state.pending;
			for (const m of action.messages) {
				// Ленту диалога, который ещё не открывали, не заводим: при открытии
				// придёт целая страница.
				if (messages[m.conversationId]) {
					messages[m.conversationId] = mergeMessages(
						messages[m.conversationId],
						[m],
					);
				}
				if (m.clientMessageId) {
					pending = pending.filter(
						(p) => p.clientMessageId !== m.clientMessageId,
					);
				}
			}
			return { ...state, messages, pending };
		}

		case "pending":
			return { ...state, pending: [...state.pending, action.message] };

		case "pendingFailed":
			return {
				...state,
				pending: state.pending.map((p) =>
					p.clientMessageId === action.clientMessageId
						? { ...p, error: action.error }
						: p,
				),
			};

		case "pendingDrop":
			return {
				...state,
				pending: state.pending.filter(
					(p) => p.clientMessageId !== action.clientMessageId,
				),
			};

		case "read": {
			const c = state.conversations[action.conversationId];
			if (!c) return state;
			const key =
				action.side === "customer" ? "customerLastReadSeq" : "staffLastReadSeq";
			if (c[key] >= action.seq) return state;
			return {
				...state,
				conversations: {
					...state.conversations,
					[c.id]: { ...c, [key]: action.seq },
				},
			};
		}

		case "customerTyping": {
			const customerTyping = { ...state.customerTyping };
			if (action.active)
				customerTyping[action.conversationId] = Date.now() + TYPING_TTL_MS;
			else delete customerTyping[action.conversationId];
			return { ...state, customerTyping };
		}

		case "composing": {
			const others = (state.composing[action.conversationId] ?? []).filter(
				(entry) => entry.adminId !== action.adminId,
			);
			if (action.active) {
				others.push({
					adminId: action.adminId,
					name: action.name,
					until: Date.now() + TYPING_TTL_MS,
				});
			}
			return {
				...state,
				composing: { ...state.composing, [action.conversationId]: others },
			};
		}

		case "viewers":
			return {
				...state,
				viewers: { ...state.viewers, [action.conversationId]: action.adminIds },
			};

		case "suggestions":
			return {
				...state,
				suggestions: {
					...state.suggestions,
					[action.conversationId]: action.suggestions,
				},
			};

		case "agents":
			return { ...state, agents: action.agents };

		case "expire": {
			const customerTyping = Object.fromEntries(
				Object.entries(state.customerTyping).filter(
					([, until]) => until > action.now,
				),
			);
			const composing = Object.fromEntries(
				Object.entries(state.composing).map(([id, list]) => [
					id,
					list.filter((entry) => entry.until > action.now),
				]),
			);
			return { ...state, customerTyping, composing };
		}
	}
}
