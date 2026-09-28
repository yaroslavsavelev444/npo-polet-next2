import type Redis from "ioredis";

// Redis для политики оповещений — отдельным соединением, а не общим
// `modules/auth/lib/redis.ts`.
//
// Общий клиент создан под BullMQ: `maxRetriesPerRequest: null` и очередь
// офлайн-команд. При недоступном Redis команда на нём не падает, а ждёт
// восстановления — сколь угодно долго. Для системы оповещения это худший
// исход: авария Redis — ровно тот момент, когда письмо нужнее всего, а оно
// повисло бы на первом же `INCR`. Здесь наоборот: офлайн-очереди нет,
// таймауты короткие, и отказ означает `null` — политика тогда переходит на
// счётчики в памяти процесса (см. `policy.ts`).
//
// Конфигурация подключения берётся та же (`redis-config.ts`), импорт —
// ленивый: модуль политики и её тесты не должны тянуть за собой схему
// окружения.

const COMMAND_TIMEOUT_MS = 1_500;

/** После неудачного подключения не пробуем снова столько времени. */
const BACKOFF_MS = 15_000;

/** Дольше этого подключения не ждём. */
const CONNECT_TIMEOUT_MS = 2_000;

let client: Redis | null = null;
let unavailableUntil = 0;

/**
 * Идущее подключение — одно на всех. Ошибки прилетают пачками: пока первая
 * подключается, остальные обязаны ждать того же подключения, а не решать,
 * что Redis недоступен, — иначе каждая из пачки ушла бы запасным путём как
 * «новая» и прислала бы своё письмо.
 */
let connecting: Promise<Redis | null> | null = null;

async function createClient(): Promise<Redis> {
	const [{ default: IORedis }, { redisConfig }] = await Promise.all([
		import("ioredis"),
		import("../../modules/auth/lib/redis-config.ts"),
	]);

	const created = new IORedis({
		...redisConfig,
		lazyConnect: true,
		enableOfflineQueue: false,
		maxRetriesPerRequest: 1,
		connectTimeout: CONNECT_TIMEOUT_MS,
		commandTimeout: COMMAND_TIMEOUT_MS,
		retryStrategy: (times: number) => Math.min(times * 500, 5_000),
	});

	// Без слушателя ioredis печатает «Unhandled error event» на каждую
	// попытку переподключения. Отказ и так виден по результату `tryRedis`.
	created.on("error", () => {});
	return created;
}

/** Дождаться `ready` — после обрыва ioredis переподключается сам. */
function waitReady(redis: Redis): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			redis.off("ready", onReady);
			reject(new Error("redis not ready"));
		}, CONNECT_TIMEOUT_MS);
		const onReady = () => {
			clearTimeout(timer);
			resolve();
		};
		redis.once("ready", onReady);
	});
}

async function connect(): Promise<Redis | null> {
	try {
		client ??= await createClient();

		if (client.status === "wait" || client.status === "end") {
			await client.connect();
		} else if (client.status !== "ready") {
			await waitReady(client);
		}

		return client;
	} catch {
		unavailableUntil = Date.now() + BACKOFF_MS;
		return null;
	}
}

async function getClient(): Promise<Redis | null> {
	if (client?.status === "ready") return client;
	if (Date.now() < unavailableUntil) return null;

	connecting ??= connect().finally(() => {
		connecting = null;
	});

	return connecting;
}

/**
 * Выполнить команды или вернуть `null`, если Redis недоступен. Не бросает.
 *
 * ⚠ `null` — это «Redis недоступен», поэтому функция, чей законный ответ
 * сам может быть `null`, должна завернуть его в объект.
 */
export async function tryRedis<T>(
	run: (redis: Redis) => Promise<T>,
): Promise<T | null> {
	try {
		const redis = await getClient();
		if (!redis) return null;
		return await run(redis);
	} catch {
		return null;
	}
}

export async function closeObservabilityRedis(): Promise<void> {
	if (!client) return;
	const current = client;
	client = null;
	await current.quit().catch(() => current.disconnect());
}
