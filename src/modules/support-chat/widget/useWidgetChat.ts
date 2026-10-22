"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { SupportTopic } from "../lib/constants";
import {
	type AckResult,
	CLIENT_EVENTS,
	type EtaDTO,
	type MessageContext,
	SERVER_EVENTS,
	type SupportAttachmentDTO,
	type SupportConversationDTO,
	type SupportMessageDTO,
} from "../lib/events";

/** Путь шлюза — как в server/gateway/server.ts (SOCKET_PATH). */
const SOCKET_PATH = "/realtime/socket.io";
const TIMEOUT_MS = 10_000;
const TYPING_TTL_MS = 6_000;

export type ChatConnection =
	| "connecting"
	| "online"
	| "offline"
	| "unauthorized"
	| "disabled";

export interface PendingMessage {
	clientMessageId: string;
	body: string;
	attachments: SupportAttachmentDTO[];
	context: MessageContext | null;
	status: "sending" | "failed";
	error: string | null;
}

export interface SendInput {
	body: string;
	attachments: SupportAttachmentDTO[];
	context: MessageContext | null;
	topic?: SupportTopic;
	/** Только для первого сообщения: slug документа согласия. */
	consentDocument?: string;
}

interface OpenResult {
	conversation: SupportConversationDTO | null;
	messages: SupportMessageDTO[];
	hasMore: boolean;
	eta: EtaDTO;
	greeting: string;
}

function merge(current: SupportMessageDTO[], incoming: SupportMessageDTO[]) {
	const byId = new Map(current.map((m) => [m.id, m]));
	for (const message of incoming) byId.set(message.id, message);
	return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * Переписка покупателя через шлюз.
 *
 * Отправка оптимистичная: сообщение сразу в ленте со статусом «отправляется»,
 * с идентификатором, выданным здесь же (clientMessageId). Обрыв связи не
 * теряет его: после переподключения неотправленные уходят повторно с тем же
 * идентификатором, и сервер не создаст дубль. Пропущенное за время обрыва
 * догружается по номеру последнего сообщения (`sync`).
 */
export function useWidgetChat(options: {
	socketUrl: string | null;
	enabled: boolean;
}) {
	const [connection, setConnection] = useState<ChatConnection>("connecting");
	const [conversation, setConversation] =
		useState<SupportConversationDTO | null>(null);
	const [messages, setMessages] = useState<SupportMessageDTO[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [eta, setEta] = useState<EtaDTO | null>(null);
	const [greeting, setGreeting] = useState("");
	const [loaded, setLoaded] = useState(false);
	const [pending, setPending] = useState<PendingMessage[]>([]);
	const [staffTyping, setStaffTyping] = useState<{
		name: string;
		until: number;
	} | null>(null);

	const socketRef = useRef<Socket | null>(null);
	const conversationRef = useRef<SupportConversationDTO | null>(null);
	const messagesRef = useRef<SupportMessageDTO[]>([]);
	const pendingRef = useRef<PendingMessage[]>([]);
	const lastInputRef = useRef(new Map<string, SendInput>());
	conversationRef.current = conversation;
	messagesRef.current = messages;
	pendingRef.current = pending;

	const request = useCallback(
		async <T>(event: string, data?: unknown): Promise<T> => {
			const socket = socketRef.current;
			if (!socket?.connected)
				throw new Error("Нет связи — сообщение уйдёт, как только она появится");
			let result: AckResult<T>;
			try {
				result = (await socket
					.timeout(TIMEOUT_MS)
					.emitWithAck(event, data)) as AckResult<T>;
			} catch {
				throw new Error("Сервер не ответил — повторите");
			}
			if (!result.ok) {
				const error = new Error(result.error.message) as Error & {
					code?: string;
				};
				error.code = result.error.code;
				throw error;
			}
			return result.data;
		},
		[],
	);

	const deliver = useCallback(
		async (clientMessageId: string) => {
			const input = lastInputRef.current.get(clientMessageId);
			if (!input) return;
			setPending((list) =>
				list.map((p) =>
					p.clientMessageId === clientMessageId
						? { ...p, status: "sending", error: null }
						: p,
				),
			);
			try {
				const result = await request<{
					message: SupportMessageDTO;
					conversation: SupportConversationDTO;
				}>(CLIENT_EVENTS.messageSend, {
					clientMessageId,
					body: input.body,
					attachmentIds: input.attachments.map((a) => a.id),
					...(input.context ? { context: input.context } : {}),
					...(input.topic ? { topic: input.topic } : {}),
					...(input.consentDocument
						? { consent: { document: input.consentDocument } }
						: {}),
				});
				lastInputRef.current.delete(clientMessageId);
				setPending((list) =>
					list.filter((p) => p.clientMessageId !== clientMessageId),
				);
				if (conversationRef.current?.id !== result.conversation.id) {
					setMessages([result.message]);
				} else {
					setMessages((list) => merge(list, [result.message]));
				}
				setConversation(result.conversation);
			} catch (error) {
				// Нет связи — оставляем «отправляется»: уйдёт после переподключения.
				const offline = !socketRef.current?.connected;
				setPending((list) =>
					list.map((p) =>
						p.clientMessageId === clientMessageId
							? {
									...p,
									status: offline ? "sending" : "failed",
									error: offline
										? null
										: error instanceof Error
											? error.message
											: "Не отправлено",
								}
							: p,
					),
				);
			}
		},
		[request],
	);

	useEffect(() => {
		if (!options.enabled) return;
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

		// Отказ шлюза при рукопожатии (middleware) Socket.IO сам не повторяет:
		// socket.active = false, и виджет оставался бы мёртвым до перезагрузки.
		// Временные отказы — «чат закрыт», «много вкладок» — проходят сами:
		// шлюз держит настройки в кэше до 30 с, пилотную группу и рубильник
		// включают, пока страница открыта. Повторяем с паузой 5→10→20→30 с.
		// «Войдите» и «запрещено писать» без действия человека не пройдут.
		let retryTimer: number | undefined;
		let retryDelay = 5_000;

		socket.on("connect", () => {
			retryDelay = 5_000;
			setConnection("online");
			const known = messagesRef.current.at(-1);
			const current = conversationRef.current;
			if (current && known) {
				void request<{ messages: SupportMessageDTO[] }>(CLIENT_EVENTS.sync, {
					conversationId: current.id,
					afterSeq: known.seq,
				})
					.then(({ messages: missed }) =>
						setMessages((list) => merge(list, missed)),
					)
					.catch(() => {});
			} else {
				void request<OpenResult>(CLIENT_EVENTS.conversationOpen)
					.then((result) => {
						setConversation(result.conversation);
						setMessages(result.messages);
						setHasMore(result.hasMore);
						setEta(result.eta);
						setGreeting(result.greeting);
						setLoaded(true);
					})
					.catch(() => setLoaded(true));
			}
			for (const item of pendingRef.current) {
				if (item.status === "sending") void deliver(item.clientMessageId);
			}
		});
		socket.on("disconnect", (reason) => {
			setConnection("offline");
			// Разрыв по инициативе сервера (выход в другой вкладке, отзыв сессии,
			// блокировка — server/kick.ts) Socket.IO сам не восстанавливает.
			// Пробуем один раз: живая сессия вернётся, отозванная получит отказ
			// при рукопожатии (connect_error → unauthorized).
			if (reason === "io server disconnect") {
				window.setTimeout(() => socket.connect(), 1_000);
			}
		});
		socket.on(
			"connect_error",
			(error: Error & { data?: { code?: string } }) => {
				const code = error.data?.code;
				setConnection(
					code === "unauthorized"
						? "unauthorized"
						: code === "disabled"
							? "disabled"
							: "offline",
				);
				if (code === "unauthorized" || code === "disabled") setLoaded(true);
				if (!socket.active && code !== "unauthorized" && code !== "forbidden") {
					window.clearTimeout(retryTimer);
					retryTimer = window.setTimeout(() => socket.connect(), retryDelay);
					retryDelay = Math.min(retryDelay * 2, 30_000);
				}
			},
		);

		socket.on(SERVER_EVENTS.messageNew, (message: SupportMessageDTO) => {
			const current = conversationRef.current;
			if (!current || message.conversationId === current.id) {
				setMessages((list) => merge(list, [message]));
			}
			if (message.authorType === "staff") setStaffTyping(null);
		});
		socket.on(
			SERVER_EVENTS.conversationUpdated,
			(updated: SupportConversationDTO) => {
				const current = conversationRef.current;
				if (!current || updated.id === current.id) {
					setConversation(updated);
				} else if (updated.status === "open" && updated.id > current.id) {
					// Начат новый диалог (из другой вкладки) — переключаемся на него.
					setConversation(updated);
					setMessages([]);
				}
			},
		);
		socket.on(
			SERVER_EVENTS.readUpdated,
			(event: { conversationId: number; side: string; seq: number }) => {
				setConversation((current) =>
					current && current.id === event.conversationId
						? {
								...current,
								[event.side === "staff"
									? "staffLastReadSeq"
									: "customerLastReadSeq"]: Math.max(
									event.seq,
									event.side === "staff"
										? current.staffLastReadSeq
										: current.customerLastReadSeq,
								),
							}
						: current,
				);
			},
		);
		socket.on(
			SERVER_EVENTS.typing,
			(event: { side: string; name?: string; active: boolean }) => {
				if (event.side !== "staff") return;
				setStaffTyping(
					event.active
						? {
								name: event.name ?? "Менеджер",
								until: Date.now() + TYPING_TTL_MS,
							}
						: null,
				);
			},
		);
		socket.on(SERVER_EVENTS.etaUpdated, (event: { eta: EtaDTO }) =>
			setEta(event.eta),
		);
		socket.on(SERVER_EVENTS.sessionRevoked, () =>
			setConnection("unauthorized"),
		);

		const expire = window.setInterval(() => {
			setStaffTyping((current) =>
				current && current.until < Date.now() ? null : current,
			);
		}, 2_000);

		return () => {
			window.clearInterval(expire);
			window.clearTimeout(retryTimer);
			socket.removeAllListeners();
			socket.disconnect();
			socketRef.current = null;
		};
	}, [options.enabled, options.socketUrl, request, deliver]);

	const send = useCallback(
		(input: SendInput) => {
			const clientMessageId = crypto.randomUUID();
			lastInputRef.current.set(clientMessageId, input);
			setPending((list) => [
				...list,
				{
					clientMessageId,
					body: input.body,
					attachments: input.attachments,
					context: input.context,
					status: "sending",
					error: null,
				},
			]);
			void deliver(clientMessageId);
		},
		[deliver],
	);

	const discard = useCallback((clientMessageId: string) => {
		lastInputRef.current.delete(clientMessageId);
		setPending((list) =>
			list.filter((p) => p.clientMessageId !== clientMessageId),
		);
	}, []);

	const loadOlder = useCallback(async () => {
		const current = conversationRef.current;
		const first = messagesRef.current[0];
		if (!current || !first) return;
		const page = await request<{
			messages: SupportMessageDTO[];
			hasMore: boolean;
		}>(CLIENT_EVENTS.history, {
			conversationId: current.id,
			beforeSeq: first.seq,
		});
		setMessages((list) => merge(list, page.messages));
		setHasMore(page.hasMore);
	}, [request]);

	const markRead = useCallback(() => {
		const current = conversationRef.current;
		const last = messagesRef.current.at(-1);
		if (!current || !last || last.seq <= current.customerLastReadSeq) return;
		void request(CLIENT_EVENTS.conversationRead, {
			conversationId: current.id,
			seq: last.seq,
		}).catch(() => {});
	}, [request]);

	const typing = useCallback((active: boolean) => {
		const current = conversationRef.current;
		if (current?.status === "open") {
			socketRef.current?.emit(CLIENT_EVENTS.typing, {
				conversationId: current.id,
				active,
			});
		}
	}, []);

	const submitCsat = useCallback(
		async (score: number, comment: string) => {
			const current = conversationRef.current;
			if (!current) return;
			const updated = await request<SupportConversationDTO>(
				CLIENT_EVENTS.csatSubmit,
				{
					conversationId: current.id,
					score,
					...(comment.trim() ? { comment: comment.trim() } : {}),
				},
			);
			setConversation(updated);
		},
		[request],
	);

	return {
		connection,
		loaded,
		conversation,
		messages,
		hasMore,
		eta,
		greeting,
		pending,
		staffTyping,
		send,
		retry: deliver,
		discard,
		loadOlder,
		markRead,
		typing,
		submitCsat,
	};
}

export type WidgetChat = ReturnType<typeof useWidgetChat>;
