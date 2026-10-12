import { Emitter } from "@socket.io/redis-emitter";
import Redis from "ioredis";
import { redisConfig } from "@/modules/auth/lib/redis-config";

/**
 * Комнаты шлюза и отправка событий в них.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КОМНАТЫ
 * ────────────────────────────────────────────────────────────────────────────
 *  user:{id}   — все вкладки покупателя. Единственная комната, в которой
 *               бывают сокеты покупателей.
 *  staff       — все менеджеры в консоли.
 *  admin:{id}  — вкладки одного менеджера.
 *  conv:{id}   — менеджеры, у которых этот диалог открыт сейчас («кто
 *               смотрит», «кто пишет ответ»). Покупатели сюда не входят.
 *
 * Отсюда главный инвариант: событие, адресованное персоналу (заметка,
 * подсказки, очередь), уходит только в staff / admin:* / conv:*, и ни
 * один покупатель его получить не может — даже ошибкой в выборе события.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * КТО ОТПРАВЛЯЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * В шлюзе — сам Socket.IO-сервер. В приложении и воркере сокет-сервера нет:
 * там события уходят через Redis (`@socket.io/redis-emitter`), и шлюз
 * раздаёт их своим подключениям через тот же redis-adapter. Сервисный слой
 * знает только интерфейс Broadcaster и не различает эти два случая.
 */

export const rooms = {
	user: (userId: number) => `user:${userId}`,
	staff: "staff",
	admin: (adminId: number) => `admin:${adminId}`,
	conversation: (conversationId: number) => `conv:${conversationId}`,
} as const;

export interface Broadcaster {
	to(room: string | string[]): {
		emit(event: string, ...args: unknown[]): unknown;
	};
	in(room: string | string[]): {
		disconnectSockets(close?: boolean): unknown;
	};
}

let redisClient: Redis | null = null;
let emitter: Emitter | null = null;

/**
 * Broadcaster для процессов без сокет-сервера. Ленивый: модуль попадает в
 * граф импорта сборки Next, где Redis нет.
 *
 * maxRetriesPerRequest: 1 вместо null из redisConfig: при недоступном Redis
 * публикация должна быстро упасть, а не висеть до переподключения.
 *
 * Эмиттеру отдаётся не сам клиент, а обёртка над `publish` — единственным,
 * что он вызывает. Эмиттер не ждёт промис публикации, и при упавшем Redis
 * отказ становился бы необработанным: воркер на этом падает целиком
 * (installWorkerProcessCapture). Недоставленное событие не теряет данных —
 * сообщение уже в базе, клиент досинхронизируется по номеру.
 */
export function getRedisBroadcaster(): Broadcaster {
	if (!emitter) {
		const client = new Redis({ ...redisConfig, maxRetriesPerRequest: 1 });
		redisClient = client;
		emitter = new Emitter({
			publish: (channel: string, message: string | Buffer) =>
				client.publish(channel, message).catch((error: unknown) => {
					console.warn("[support-chat] событие не опубликовано", error);
					return 0;
				}),
		});
	}
	return emitter as unknown as Broadcaster;
}

export async function closeRedisBroadcaster(): Promise<void> {
	const client = redisClient;
	redisClient = null;
	emitter = null;
	if (client) await client.quit().catch(() => client.disconnect());
}

/**
 * Разорвать все сокеты покупателя: блокировка, отзыв сессий, удаление
 * аккаунта. Подключиться заново он уже не сможет — шлюз проверит статус при
 * рукопожатии.
 */
export function disconnectUserSockets(
	broadcaster: Broadcaster,
	userId: number,
): void {
	broadcaster.in(rooms.user(userId)).disconnectSockets(true);
}
