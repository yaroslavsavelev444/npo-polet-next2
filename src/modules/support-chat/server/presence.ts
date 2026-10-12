import type Redis from "ioredis";
import type { AgentStatus } from "../lib/constants.ts";

/**
 * Присутствие менеджеров в консоли — в Redis, а не в памяти шлюза: при
 * нескольких экземплярах шлюза (и для воркера, который распределяет
 * диалоги) «кто на месте» должно быть одним на всех.
 *
 * Хеш `support:presence`: adminId → { status, lastSeen, lastActivity }.
 *
 *  • lastSeen — пульс открытой консоли (шлюз обновляет его, пока сокет
 *    подключён). Пульс пропал дольше OFFLINE_AFTER_MS — менеджер «не в сети».
 *    Это же даёт отсрочку при перезагрузке страницы: пока пульс свежий,
 *    короткий разрыв никого не перераспределяет.
 *  • status — то, что менеджер выбрал сам: «на месте» или «отошёл».
 *  • lastActivity — последнее действие в консоли. Больше AWAY_AFTER_MS без
 *    действий — «отошёл», даже если не переключался: открытая и забытая
 *    вкладка не должна собирать диалоги.
 */

const KEY = "support:presence";
/** Ключ живёт сутки с последней записи — забытые записи уходят сами. */
const KEY_TTL_SECONDS = 24 * 60 * 60;

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const OFFLINE_AFTER_MS = 90_000;
export const AWAY_AFTER_MS = 10 * 60_000;

interface StoredPresence {
	status: Exclude<AgentStatus, "offline">;
	lastSeen: number;
	lastActivity: number;
}

function parse(value: string | null | undefined): StoredPresence | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as Partial<StoredPresence>;
		if (typeof parsed.lastSeen !== "number") return null;
		return {
			status: parsed.status === "away" ? "away" : "available",
			lastSeen: parsed.lastSeen,
			lastActivity:
				typeof parsed.lastActivity === "number"
					? parsed.lastActivity
					: parsed.lastSeen,
		};
	} catch {
		return null;
	}
}

export function effectiveStatus(
	stored: StoredPresence | null,
	now: number = Date.now(),
): AgentStatus {
	if (!stored || now - stored.lastSeen > OFFLINE_AFTER_MS) return "offline";
	if (stored.status === "away" || now - stored.lastActivity > AWAY_AFTER_MS)
		return "away";
	return "available";
}

/**
 * Обновить присутствие. Без аргументов — только пульс; `activity` — было
 * действие; `status` — менеджер сменил статус сам.
 *
 * Чтение и запись не атомарны, но пишет в поле только шлюз этого же
 * менеджера, и потерянное обновление восстановится следующим пульсом.
 */
export async function touchPresence(
	redis: Redis,
	adminId: number,
	update: { status?: StoredPresence["status"]; activity?: boolean } = {},
	now: number = Date.now(),
): Promise<AgentStatus> {
	const previous = parse(await redis.hget(KEY, String(adminId)));
	const next: StoredPresence = {
		status: update.status ?? previous?.status ?? "available",
		lastSeen: now,
		lastActivity:
			update.activity || update.status || !previous
				? now
				: previous.lastActivity,
	};
	await redis
		.multi()
		.hset(KEY, String(adminId), JSON.stringify(next))
		.expire(KEY, KEY_TTL_SECONDS)
		.exec();
	return effectiveStatus(next, now);
}

/** Сразу «не в сети» — при выходе из консоли, без ожидания пропажи пульса. */
export async function clearPresence(
	redis: Redis,
	adminId: number,
): Promise<void> {
	await redis.hdel(KEY, String(adminId));
}

export async function readPresence(
	redis: Redis,
	now: number = Date.now(),
): Promise<Map<number, AgentStatus>> {
	const all = await redis.hgetall(KEY);
	const result = new Map<number, AgentStatus>();
	for (const [adminId, value] of Object.entries(all)) {
		result.set(Number(adminId), effectiveStatus(parse(value), now));
	}
	return result;
}
