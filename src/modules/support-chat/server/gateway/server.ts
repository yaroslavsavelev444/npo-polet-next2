import type { Server as HttpServer } from "node:http";
import { sql } from "@payloadcms/db-postgres";
import { createAdapter } from "@socket.io/redis-adapter";
import type Redis from "ioredis";
import type { Payload } from "payload";
import { Server, type Socket } from "socket.io";
import type { z } from "zod";
import { checkRateLimit } from "@/modules/auth/lib/rateLimit";
import { captureError } from "@/services/observability/capture";
import {
	type AckResult,
	CLIENT_EVENTS,
	SERVER_EVENTS,
	type SupportErrorCode,
} from "../../lib/events.ts";
import {
	conversationOpenSchema,
	conversationReadSchema,
	csatSchema,
	historySchema,
	messageSendSchema,
	staffConversationSchema,
	staffListSchema,
	staffMessageSendSchema,
	staffPresenceSchema,
	staffSnoozeSchema,
	staffSuggestionsSchema,
	staffTagsSchema,
	staffTransferSchema,
	syncSchema,
	typingSchema,
} from "../../lib/schemas.ts";
import type { Broadcaster } from "../broadcast.ts";
import { rooms } from "../broadcast.ts";
import { drizzleOf, queryOne } from "../db.ts";
import { isSupportError, SupportError } from "../errors.ts";
import { startPeriodicTasks } from "../periodic.ts";
import {
	CHAT_BANNED_MESSAGE,
	type CustomerActor,
	type StaffActor,
	type SupportActor,
} from "../permissions.ts";
import {
	HEARTBEAT_INTERVAL_MS,
	OFFLINE_AFTER_MS,
	touchPresence,
} from "../presence.ts";
import { getSupportConfig, isChatOpenForUser } from "../settings.ts";
import * as service from "../support.service.ts";
import {
	type AuthHeaders,
	authenticate,
	clientIp,
	isAllowedHandshakeSource,
	pickAuthHeaders,
	sameActor,
} from "./auth.ts";

/**
 * Socket.IO-шлюз чата поддержки.
 *
 * Шлюз — только транспорт: проверяет, кто подключился, валидирует события,
 * ограничивает частоту и зовёт support.service.ts. Ни одного решения о
 * данных здесь нет — иначе HTTP и воркер разошлись бы с сокетом.
 *
 * Путь — `/realtime/socket.io`, а не `/realtime`: engine.io перехватывает
 * всё, что начинается с его пути, и `/realtime/health` иначе ушёл бы ему.
 */

export const SOCKET_PATH = "/realtime/socket.io";
export const HEALTH_PATH = "/realtime/health";

/** Сокетов на одного покупателя: вкладки, телефон. Больше — подозрительно. */
const MAX_SOCKETS_PER_USER = 10;
/** Как часто перепроверять сессию перед изменяющим действием. */
const AUTH_RECHECK_MS = 60_000;
/** Тихие сокеты перепроверяются фоном раз в столько (выход в другой вкладке). */
const IDLE_AUTH_RECHECK_MS = 5 * 60_000;
/** typing чаще раза в секунду отбрасывается молча. */
const TYPING_MIN_INTERVAL_MS = 1_000;
/** Отметка «было действие» в присутствии — не чаще. */
const ACTIVITY_TOUCH_INTERVAL_MS = 15_000;

const LIMITS = {
	customerPerMinute: { limit: 20, windowMs: 60_000 },
	customerPerDay: { limit: 300, windowMs: 24 * 60 * 60_000 },
	newConversationsPerDay: { limit: 5, windowMs: 24 * 60 * 60_000 },
	staffPerMinute: { limit: 120, windowMs: 60_000 },
} as const;

interface SocketData {
	actor: SupportActor;
	authHeaders: AuthHeaders;
	authCheckedAt: number;
	userAgent: string | null;
	ip: string;
	lastTypingAt: number;
	lastActivityTouchAt: number;
}

type SupportSocket = Socket<
	Record<string, (...args: unknown[]) => void>,
	Record<string, (...args: unknown[]) => void>,
	Record<string, never>,
	SocketData
>;

export interface GatewayOptions {
	payload: Payload;
	/** Клиент для присутствия; rate limit ходит через общий клиент modules/auth. */
	redis: Redis;
	httpServer: HttpServer;
	allowedOrigins: string[];
	/**
	 * Клиенты redis-adapter (pub и отдельный sub). Без них — адаптер в памяти:
	 * годится для тестов, но события из приложения и воркера (redis-emitter)
	 * тогда до сокетов не дойдут.
	 */
	adapter?: { pub: Redis; sub: Redis };
	/** Минутный обход и статистика ответа (periodic.ts). В тестах — выключено. */
	periodicTasks?: boolean;
}

export interface SupportGateway {
	io: Server;
	close: () => Promise<void>;
}

function handshakeError(code: SupportErrorCode, message: string): Error {
	const error = new Error(code) as Error & { data?: unknown };
	error.data = { code, message };
	return error;
}

export function createSupportGateway(options: GatewayOptions): SupportGateway {
	const { payload, redis, allowedOrigins } = options;

	const io = new Server(options.httpServer, {
		path: SOCKET_PATH,
		transports: ["websocket", "polling"],
		// Сообщение — до 4000 символов; 64 КБ покрывают его с запасом и не
		// дают одним кадром занять память шлюза.
		maxHttpBufferSize: 64_000,
		pingInterval: 25_000,
		pingTimeout: 20_000,
		cors: { origin: allowedOrigins, credentials: true },
		allowRequest: (request, callback) => {
			callback(null, isAllowedHandshakeSource(request.headers, allowedOrigins));
		},
	});

	if (options.adapter) {
		io.adapter(createAdapter(options.adapter.pub, options.adapter.sub));
	}

	const deps: service.SupportDeps = {
		payload,
		redis,
		broadcaster: io as unknown as Broadcaster,
		// Через adapter — видит сокеты всех экземпляров шлюза.
		isUserOnline: async (userId) =>
			(await io.in(rooms.user(userId)).fetchSockets()).length > 0,
	};

	// ── Рукопожатие ────────────────────────────────────────────────────────

	io.use(async (rawSocket, next) => {
		const socket = rawSocket as SupportSocket;
		try {
			const headers = socket.handshake.headers;
			const authHeaders = pickAuthHeaders(headers);
			const actor = await authenticate(payload, authHeaders);
			if (!actor)
				return next(handshakeError("unauthorized", "Войдите в аккаунт"));

			if (actor.kind === "customer") {
				if (actor.chatBanned) {
					return next(handshakeError("forbidden", CHAT_BANNED_MESSAGE));
				}
				const config = await getSupportConfig(payload);
				if (!isChatOpenForUser(config, actor.userId)) {
					return next(
						handshakeError("disabled", "Чат с менеджером пока недоступен"),
					);
				}
				const existing = await io.in(rooms.user(actor.userId)).fetchSockets();
				if (existing.length >= MAX_SOCKETS_PER_USER) {
					return next(
						handshakeError("rate_limited", "Слишком много открытых вкладок"),
					);
				}
			}

			socket.data = {
				actor,
				authHeaders,
				authCheckedAt: Date.now(),
				userAgent:
					typeof headers["user-agent"] === "string"
						? headers["user-agent"]
						: null,
				ip: clientIp(headers, socket.handshake.address),
				lastTypingAt: 0,
				lastActivityTouchAt: 0,
			};
			next();
		} catch (error) {
			captureError(error, {
				source: "process",
				severity: "error",
				module: "support-chat/gateway/handshake",
			});
			next(handshakeError("internal", "Не удалось подключиться"));
		}
	});

	// ── Повторная проверка сессии ──────────────────────────────────────────

	/**
	 * Сессия всё ещё действует и принадлежит тому же человеку. Иначе —
	 * `session:revoked` и разрыв: выход, отзыв сессии или блокировка должны
	 * отрезать и сокет, а не только HTTP.
	 */
	async function ensureFreshAuth(
		socket: SupportSocket,
		maxAgeMs: number,
	): Promise<boolean> {
		if (Date.now() - socket.data.authCheckedAt < maxAgeMs) return true;
		const actor = await authenticate(payload, socket.data.authHeaders);
		if (actor && sameActor(actor, socket.data.actor)) {
			socket.data.actor = actor;
			socket.data.authCheckedAt = Date.now();
			return true;
		}
		socket.emit(SERVER_EVENTS.sessionRevoked, {});
		socket.disconnect(true);
		return false;
	}

	const authSweep = setInterval(() => {
		for (const socket of io.of("/").sockets.values()) {
			void ensureFreshAuth(socket as SupportSocket, IDLE_AUTH_RECHECK_MS).catch(
				() => {},
			);
		}
	}, 60_000);
	authSweep.unref();

	// ── Обработчик события с ack ───────────────────────────────────────────

	function on<S extends z.ZodType, R>(
		socket: SupportSocket,
		event: string,
		schema: S,
		handler: (input: z.infer<S>) => Promise<R>,
		options: { mutating?: boolean } = {},
	): void {
		socket.on(event, async (raw: unknown, maybeAck?: unknown) => {
			const ack =
				typeof maybeAck === "function"
					? (maybeAck as (result: AckResult<R>) => void)
					: () => {};
			try {
				if (
					options.mutating &&
					!(await ensureFreshAuth(socket, AUTH_RECHECK_MS))
				)
					return;

				const parsed = schema.safeParse(raw);
				if (!parsed.success) {
					ack({
						ok: false,
						error: {
							code: "invalid",
							message: parsed.error.issues[0]?.message ?? "Неверные данные",
						},
					});
					return;
				}
				ack({ ok: true, data: await handler(parsed.data) });
			} catch (error) {
				if (isSupportError(error)) {
					ack({
						ok: false,
						error: { code: error.code, message: error.message },
					});
					return;
				}
				const errorId = captureError(error, {
					source: "process",
					severity: "error",
					module: `support-chat/gateway/${event}`,
					userId:
						socket.data.actor.kind === "customer"
							? socket.data.actor.userId
							: null,
					ip: socket.data.ip,
					userAgent: socket.data.userAgent,
				});
				console.error(`[support-gateway] ${event} failed`, { errorId });
				ack({
					ok: false,
					error: {
						code: "internal",
						message: "Что-то пошло не так, повторите попытку",
					},
				});
			}
		});
	}

	async function enforceLimit(
		key: string,
		limit: { limit: number; windowMs: number },
	) {
		const result = await checkRateLimit(key, limit.limit, limit.windowMs);
		if (!result.allowed) {
			throw new SupportError(
				"rate_limited",
				"Слишком часто — подождите немного",
			);
		}
	}

	// ── Покупатель ─────────────────────────────────────────────────────────

	function registerCustomer(socket: SupportSocket, actor: CustomerActor) {
		void socket.join(rooms.user(actor.userId));

		on(socket, CLIENT_EVENTS.conversationOpen, conversationOpenSchema, () =>
			service.openCustomerConversation(deps, actor),
		);

		on(
			socket,
			CLIENT_EVENTS.messageSend,
			messageSendSchema,
			async (input) => {
				await enforceLimit(
					`support:msg:min:${actor.userId}`,
					LIMITS.customerPerMinute,
				);
				await enforceLimit(
					`support:msg:day:${actor.userId}`,
					LIMITS.customerPerDay,
				);
				const hasOpen = await queryOne(
					drizzleOf(payload),
					sql`SELECT 1 FROM support_conversations
						WHERE user_id = ${actor.userId} AND status = 'open'`,
				);
				if (!hasOpen) {
					await enforceLimit(
						`support:conv:day:${actor.userId}`,
						LIMITS.newConversationsPerDay,
					);
				}
				return service.sendCustomerMessage(deps, actor, input, {
					userAgent: socket.data.userAgent,
				});
			},
			{ mutating: true },
		);

		on(
			socket,
			CLIENT_EVENTS.csatSubmit,
			csatSchema,
			(input) => service.submitCsat(deps, actor, input),
			{ mutating: true },
		);

		registerShared(socket);
	}

	// ── Общее для обеих сторон ─────────────────────────────────────────────

	function registerShared(socket: SupportSocket) {
		const actor = () => socket.data.actor;

		on(
			socket,
			CLIENT_EVENTS.conversationRead,
			conversationReadSchema,
			(input) => service.markRead(deps, actor(), input),
		);
		on(socket, CLIENT_EVENTS.sync, syncSchema, (input) =>
			service.syncMessages(deps, actor(), input),
		);
		on(socket, CLIENT_EVENTS.history, historySchema, (input) =>
			service.loadHistory(deps, actor(), input),
		);

		socket.on(CLIENT_EVENTS.typing, (raw: unknown) => {
			const now = Date.now();
			if (now - socket.data.lastTypingAt < TYPING_MIN_INTERVAL_MS) return;
			const parsed = typingSchema.safeParse(raw);
			if (!parsed.success) return;
			socket.data.lastTypingAt = now;
			void service.relayTyping(deps, actor(), parsed.data).catch(() => {});
		});
	}

	// ── Менеджер ───────────────────────────────────────────────────────────

	async function broadcastPresence() {
		const agents = await service.listAgentPresence(deps);
		io.to(rooms.staff).emit(SERVER_EVENTS.presenceUpdated, agents);
	}

	async function broadcastViewers(conversationId: number) {
		const sockets = await io
			.in(rooms.conversation(conversationId))
			.fetchSockets();
		const adminIds = [
			...new Set(
				sockets
					.map((s) => (s.data as SocketData).actor)
					.filter((a): a is StaffActor => a?.kind === "staff")
					.map((a) => a.adminId),
			),
		];
		io.to(rooms.staff).emit(SERVER_EVENTS.viewersUpdated, {
			conversationId,
			adminIds,
		});
	}

	function touchActivity(socket: SupportSocket, actor: StaffActor) {
		const now = Date.now();
		if (now - socket.data.lastActivityTouchAt < ACTIVITY_TOUCH_INTERVAL_MS)
			return;
		socket.data.lastActivityTouchAt = now;
		void touchPresence(redis, actor.adminId, { activity: true }).catch(
			() => {},
		);
	}

	function registerStaff(socket: SupportSocket, actor: StaffActor) {
		void socket.join([rooms.staff, rooms.admin(actor.adminId)]);

		// Любое событие менеджера — признак, что он за консолью.
		socket.onAny(() => touchActivity(socket, actor));

		void (async () => {
			const status = await touchPresence(redis, actor.adminId, {
				activity: true,
			});
			await broadcastPresence();
			if (status === "available") await service.drainQueue(deps);
		})().catch((error) => {
			captureError(error, {
				source: "process",
				module: "support-chat/gateway/presence",
			});
		});

		const limited = async () =>
			enforceLimit(`support:staff:msg:${actor.adminId}`, LIMITS.staffPerMinute);

		on(socket, CLIENT_EVENTS.staffConversationsList, staffListSchema, (input) =>
			service.listForStaff(deps, actor, input),
		);
		on(
			socket,
			CLIENT_EVENTS.staffConversationGet,
			staffConversationSchema,
			(input) => service.getForStaff(deps, actor, input.conversationId),
		);
		on(
			socket,
			CLIENT_EVENTS.staffMessageSend,
			staffMessageSendSchema,
			async (input) => {
				await limited();
				return service.sendStaffMessage(deps, actor, input);
			},
			{ mutating: true },
		);
		on(
			socket,
			CLIENT_EVENTS.staffClaim,
			staffConversationSchema,
			(input) => service.claimForStaff(deps, actor, input.conversationId),
			{ mutating: true },
		);
		on(
			socket,
			CLIENT_EVENTS.staffTransfer,
			staffTransferSchema,
			(input) => service.transferForStaff(deps, actor, input),
			{ mutating: true },
		);
		on(
			socket,
			CLIENT_EVENTS.staffResolve,
			staffConversationSchema,
			(input) => service.resolveForStaff(deps, actor, input.conversationId),
			{ mutating: true },
		);
		on(
			socket,
			CLIENT_EVENTS.staffReopen,
			staffConversationSchema,
			(input) => service.reopenForStaff(deps, actor, input.conversationId),
			{ mutating: true },
		);
		on(
			socket,
			CLIENT_EVENTS.staffSnooze,
			staffSnoozeSchema,
			(input) => service.snoozeForStaff(deps, actor, input),
			{ mutating: true },
		);
		on(
			socket,
			CLIENT_EVENTS.staffTags,
			staffTagsSchema,
			(input) => service.setTagsForStaff(deps, actor, input),
			{ mutating: true },
		);
		on(
			socket,
			CLIENT_EVENTS.staffSuggestions,
			staffSuggestionsSchema,
			(input) => service.suggestionsForStaff(deps, actor, input),
		);
		on(socket, CLIENT_EVENTS.staffCanned, conversationOpenSchema, () =>
			service.cannedForStaff(deps, actor),
		);

		on(
			socket,
			CLIENT_EVENTS.staffPresence,
			staffPresenceSchema,
			async (input) => {
				const status = await touchPresence(redis, actor.adminId, {
					status: input.status,
				});
				await broadcastPresence();
				if (status === "available") await service.drainQueue(deps);
				return { status };
			},
			{ mutating: true },
		);

		on(
			socket,
			CLIENT_EVENTS.staffJoin,
			staffConversationSchema,
			async (input) => {
				await socket.join(rooms.conversation(input.conversationId));
				await broadcastViewers(input.conversationId);
				return { joined: true };
			},
		);
		on(
			socket,
			CLIENT_EVENTS.staffLeave,
			staffConversationSchema,
			async (input) => {
				await socket.leave(rooms.conversation(input.conversationId));
				await broadcastViewers(input.conversationId);
				return { left: true };
			},
		);

		socket.on(CLIENT_EVENTS.staffComposing, (raw: unknown) => {
			const parsed = typingSchema.safeParse(raw);
			if (!parsed.success) return;
			// Другим менеджерам — защита от двух ответов одному покупателю.
			socket.to(rooms.staff).emit(SERVER_EVENTS.composing, {
				conversationId: parsed.data.conversationId,
				adminId: actor.adminId,
				name: actor.name,
				active: parsed.data.active,
			});
		});

		socket.on("disconnecting", () => {
			const viewing = [...socket.rooms]
				.filter((room) => room.startsWith("conv:"))
				.map((room) => Number(room.slice("conv:".length)));
			// После выхода из комнат — иначе ушедший ещё числился бы зрителем.
			setImmediate(() => {
				for (const id of viewing) void broadcastViewers(id).catch(() => {});
			});
			// Присутствие гаснет само, когда пропадёт пульс; разослать
			// обновлённый список — после этого срока.
			setTimeout(
				() => void broadcastPresence().catch(() => {}),
				OFFLINE_AFTER_MS + 1_000,
			).unref();
		});

		registerShared(socket);
	}

	io.on("connection", (rawSocket) => {
		const socket = rawSocket as SupportSocket;
		const { actor } = socket.data;
		if (actor.kind === "customer") registerCustomer(socket, actor);
		else registerStaff(socket, actor);
	});

	// ── Пульс присутствия ──────────────────────────────────────────────────

	const heartbeat = setInterval(() => {
		const adminIds = new Set<number>();
		for (const socket of io.of("/").sockets.values()) {
			const actor = (socket as SupportSocket).data.actor;
			if (actor?.kind === "staff") adminIds.add(actor.adminId);
		}
		for (const adminId of adminIds) {
			void touchPresence(redis, adminId).catch(() => {});
		}
	}, HEARTBEAT_INTERVAL_MS);
	heartbeat.unref();

	const stopPeriodic = options.periodicTasks
		? startPeriodicTasks(deps)
		: () => {};

	return {
		io,
		close: async () => {
			clearInterval(heartbeat);
			stopPeriodic();
			clearInterval(authSweep);
			await new Promise<void>((resolve) => io.close(() => resolve()));
		},
	};
}
