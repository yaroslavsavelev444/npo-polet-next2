"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import {
	type AckResult,
	type AgentPresenceDTO,
	type CannedSuggestionDTO,
	CLIENT_EVENTS,
	type ConversationPageDTO,
	SERVER_EVENTS,
	type StaffConversationDTO,
	type SupportMessageDTO,
} from "../../lib/events";
import { notifyNewMessage, setTitleBadge } from "./signals";
import {
	type ConsoleAction,
	type ConsoleState,
	initialState,
	isUnreadForStaff,
	reducer,
	type StaffTab,
} from "./state";

/** Путь шлюза — тот же, что в server/gateway/server.ts (SOCKET_PATH). */
const SOCKET_PATH = "/realtime/socket.io";
const REQUEST_TIMEOUT_MS = 10_000;

export class ConsoleRequestError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
}

export interface ConsoleApi {
	state: ConsoleState;
	request: <T>(event: string, data?: unknown) => Promise<T>;
	emit: (event: string, data: unknown) => void;
	dispatch: (action: ConsoleAction) => void;
	setTab: (tab: StaffTab) => void;
	select: (id: number | null) => void;
	loadOlder: (conversationId: number) => Promise<void>;
}

/**
 * Подключение консоли к шлюзу и сборка состояния из событий.
 *
 * Переподключение — дело Socket.IO; после него консоль перечитывает список
 * и догружает открытый диалог по номеру последнего известного сообщения
 * (`sync`), так что пропущенное за время разрыва не теряется.
 */
export function useConsole(options: {
	adminId: number;
	socketUrl: string | null;
	initialConversationId: number | null;
}): ConsoleApi {
	const { adminId } = options;
	const [state, dispatch] = useReducer(
		(s: ConsoleState, a: ConsoleAction) => reducer(s, a, adminId),
		options.initialConversationId,
		initialState,
	);
	const socketRef = useRef<Socket | null>(null);
	const stateRef = useRef(state);
	stateRef.current = state;

	const request = useCallback(
		async <T>(event: string, data?: unknown): Promise<T> => {
			const socket = socketRef.current;
			if (!socket?.connected) {
				throw new ConsoleRequestError(
					"offline",
					"Нет связи с сервером — подождите переподключения",
				);
			}
			let result: AckResult<T>;
			try {
				result = (await socket
					.timeout(REQUEST_TIMEOUT_MS)
					.emitWithAck(event, data)) as AckResult<T>;
			} catch {
				throw new ConsoleRequestError(
					"timeout",
					"Сервер не ответил — повторите",
				);
			}
			if (!result.ok)
				throw new ConsoleRequestError(result.error.code, result.error.message);
			return result.data;
		},
		[],
	);

	const emit = useCallback((event: string, data: unknown) => {
		socketRef.current?.emit(event, data);
	}, []);

	const loadList = useCallback(
		async (tab: StaffTab) => {
			const conversations = await request<StaffConversationDTO[]>(
				CLIENT_EVENTS.staffConversationsList,
				{ tab, limit: 100 },
			);
			dispatch({ type: "list", tab, conversations, append: false });
		},
		[request],
	);

	const openConversation = useCallback(
		async (id: number) => {
			const page = await request<ConversationPageDTO<StaffConversationDTO>>(
				CLIENT_EVENTS.staffConversationGet,
				{ conversationId: id },
			);
			dispatch({ type: "page", ...page });
			emit(CLIENT_EVENTS.staffJoin, { conversationId: id });
			// Подсказки к последнему вопросу покупателя — сразу при открытии, а не
			// только к сообщениям, пришедшим при открытой консоли.
			const lastQuestion = [...page.messages]
				.reverse()
				.find((m) => m.authorType === "customer" && m.body);
			if (lastQuestion && page.conversation.status === "open") {
				void request<CannedSuggestionDTO[]>(CLIENT_EVENTS.staffSuggestions, {
					conversationId: id,
					text: lastQuestion.body,
				})
					.then((suggestions) =>
						dispatch({ type: "suggestions", conversationId: id, suggestions }),
					)
					.catch(() => {});
			}
		},
		[request, emit],
	);

	// ── Соединение ─────────────────────────────────────────────────────────
	useEffect(() => {
		const socket = io(options.socketUrl ?? undefined, {
			path: SOCKET_PATH,
			// Сначала WebSocket; корпоративный прокси без него — long-polling.
			// tryAllTransports обязателен: без него неудачный WebSocket обрывает
			// попытку целиком, и до polling дело не доходит.
			transports: ["websocket", "polling"],
			tryAllTransports: true,
			withCredentials: true,
		});
		socketRef.current = socket;

		const on = <T>(event: string, handler: (data: T) => void) =>
			socket.on(event, handler);

		socket.on("connect", () => {
			dispatch({ type: "connection", status: "online" });
			const current = stateRef.current;
			void loadList(current.tab).catch(() => {});
			if (current.selectedId !== null) {
				const known = current.messages[current.selectedId];
				const lastSeq = known?.at(-1)?.seq;
				if (lastSeq === undefined) {
					void openConversation(current.selectedId).catch(() => {});
				} else {
					emit(CLIENT_EVENTS.staffJoin, { conversationId: current.selectedId });
					void request<{ messages: SupportMessageDTO[] }>(CLIENT_EVENTS.sync, {
						conversationId: current.selectedId,
						afterSeq: lastSeq,
					})
						.then(({ messages }) => dispatch({ type: "messages", messages }))
						.catch(() => {});
				}
			}
		});
		socket.on("disconnect", (reason) => {
			dispatch({ type: "connection", status: "offline" });
			// Сервер закрыл соединение сам (перезапуск шлюза, отзыв сессии) —
			// Socket.IO в этом случае не переподключается; пробуем один раз.
			if (reason === "io server disconnect") {
				window.setTimeout(() => socket.connect(), 1_000);
			}
		});
		socket.on(
			"connect_error",
			(error: Error & { data?: { code?: string } }) => {
				dispatch({
					type: "connection",
					status: error.data?.code === "unauthorized" ? "revoked" : "offline",
				});
			},
		);

		on<SupportMessageDTO>(SERVER_EVENTS.messageNew, (message) => {
			dispatch({ type: "messages", messages: [message] });
			if (message.authorType !== "customer") return;
			const current = stateRef.current;
			const conversation = current.conversations[message.conversationId];
			const visible =
				!document.hidden && current.selectedId === message.conversationId;
			if (
				!visible &&
				(conversation?.assigneeId === adminId ||
					conversation?.assigneeId == null)
			) {
				notifyNewMessage(
					message.author?.name ?? "Покупатель",
					message.conversationId,
				);
			}
		});
		on<StaffConversationDTO>(
			SERVER_EVENTS.conversationUpdated,
			(conversation) => dispatch({ type: "conversation", conversation }),
		);
		on<{ conversationId: number; side: "customer" | "staff"; seq: number }>(
			SERVER_EVENTS.readUpdated,
			(event) => dispatch({ type: "read", ...event }),
		);
		on<{ conversationId: number; side: string; active: boolean }>(
			SERVER_EVENTS.typing,
			(event) => {
				if (event.side === "customer") {
					dispatch({
						type: "customerTyping",
						conversationId: event.conversationId,
						active: event.active,
					});
				}
			},
		);
		on<{
			conversationId: number;
			adminId: number;
			name: string;
			active: boolean;
		}>(SERVER_EVENTS.composing, (event) => {
			if (event.adminId !== adminId) dispatch({ type: "composing", ...event });
		});
		on<{ conversationId: number; adminIds: number[] }>(
			SERVER_EVENTS.viewersUpdated,
			(event) => dispatch({ type: "viewers", ...event }),
		);
		on<{ conversationId: number; suggestions: CannedSuggestionDTO[] }>(
			SERVER_EVENTS.suggestionsUpdated,
			(event) => dispatch({ type: "suggestions", ...event }),
		);
		on<AgentPresenceDTO[]>(SERVER_EVENTS.presenceUpdated, (agents) =>
			dispatch({ type: "agents", agents }),
		);
		on(SERVER_EVENTS.sessionRevoked, () =>
			dispatch({ type: "connection", status: "revoked" }),
		);

		const expire = window.setInterval(
			() => dispatch({ type: "expire", now: Date.now() }),
			2_000,
		);

		return () => {
			window.clearInterval(expire);
			socket.removeAllListeners();
			socket.disconnect();
			socketRef.current = null;
		};
	}, [options.socketUrl, adminId, loadList, openConversation, request, emit]);

	// ── Счётчик во вкладке браузера ────────────────────────────────────────
	useEffect(() => {
		const waiting = Object.values(state.conversations).filter(
			(c) =>
				c.status === "open" &&
				(c.assigneeId === adminId || c.assigneeId === null) &&
				isUnreadForStaff(c),
		).length;
		setTitleBadge(waiting);
	}, [state.conversations, adminId]);

	useEffect(() => () => setTitleBadge(0), []);

	const setTab = useCallback(
		(tab: StaffTab) => {
			dispatch({ type: "tab", tab });
			void loadList(tab).catch(() => {});
		},
		[loadList],
	);

	const select = useCallback(
		(id: number | null) => {
			const previous = stateRef.current.selectedId;
			if (previous !== null && previous !== id) {
				emit(CLIENT_EVENTS.staffLeave, { conversationId: previous });
			}
			dispatch({ type: "select", id });
			const url = new URL(window.location.href);
			if (id === null) url.searchParams.delete("c");
			else url.searchParams.set("c", String(id));
			window.history.replaceState(null, "", url);
			if (id !== null) void openConversation(id).catch(() => {});
		},
		[emit, openConversation],
	);

	const loadOlder = useCallback(
		async (conversationId: number) => {
			const first = stateRef.current.messages[conversationId]?.[0];
			if (!first) return;
			const page = await request<{
				messages: SupportMessageDTO[];
				hasMore: boolean;
			}>(CLIENT_EVENTS.history, { conversationId, beforeSeq: first.seq });
			dispatch({ type: "older", conversationId, ...page });
		},
		[request],
	);

	return { state, request, emit, dispatch, setTab, select, loadOlder };
}
