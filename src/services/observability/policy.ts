import { tryRedis } from "./redis.ts";
import type {
	AlertingSettings,
	AlertStats,
	AlertTrigger,
	Severity,
} from "./types.ts";
import { meetsThreshold } from "./types.ts";

// Решение «отправлять или молчать». Единственное место, где оно принимается.
//
// Одна ошибка, случившаяся тысячу раз, должна превратиться в несколько
// писем, а не в тысячу — и не в ноль.
//
// ─── Механика ───────────────────────────────────────────────────────────────
//
// На каждый отпечаток в Redis два ключа:
//
//   alert:fp:<fp>    хеш со счётчиками: сколько раз, когда впервые, сколько
//                    писем ушло, на каком счётчике было последнее;
//   alert:gate:<fp>  замок паузы. Существует — письмо сейчас не уходит.
//
// Замок ставится через `SET NX EX`: из нескольких процессов, поймавших одну
// ошибку одновременно, письмо отправит ровно один.
//
// Сброс состояния — это скользящий TTL хеша (`cooldownResetSeconds`), а не
// отдельный механизм: ошибка, молчавшая шесть часов, теряет ключ и
// возвращается как новая — сразу и с полным стеком.
//
// ─── Отказ Redis не выключает оповещение ────────────────────────────────────
//
// Без Redis работает та же арифметика в памяти процесса. Она хуже — у
// веб-приложения и воркеров счётчики разные, — но подавленное из-за отказа
// кэша письмо было бы ровно тем, которое было нужно.

const LOCAL_STATE_LIMIT = 500;

const OVERFLOW_KEY = "alert:budget:overflow";

/**
 * Пауза перед СЛЕДУЮЩЕЙ отправкой: удвоение от базы до потолка,
 * 1 мин → 2 → 4 → … → 6 ч. Давно известная поломка не должна занимать почту
 * каждые пять минут, но и пропадать не должна: потолок в шесть часов — это
 * четыре напоминания в сутки.
 */
export function cooldownSeconds(
	sendCount: number,
	settings: Pick<
		AlertingSettings,
		"cooldownBaseSeconds" | "cooldownMaxSeconds"
	>,
): number {
	if (sendCount <= 0) return settings.cooldownBaseSeconds;

	// Показатель ограничен: `2 ** 40` дал бы по дороге к потолку число, с
	// которым `EX` в Redis уже не работает.
	const factor = 2 ** Math.min(sendCount, 20);

	return Math.min(
		settings.cooldownBaseSeconds * factor,
		settings.cooldownMaxSeconds,
	);
}

/**
 * 100-й, 1000-й, 10000-й повтор пробивают паузу. Это ловит случай «давно
 * известная ошибка тихо превратилась в аварию». Пороги редкие и растущие,
 * поэтому механизм сам не может стать источником спама.
 */
export function isBurstMilestone(occurrences: number): boolean {
	if (occurrences < 100) return false;

	for (let threshold = 100; threshold <= occurrences; threshold *= 10) {
		if (threshold === occurrences) return true;
	}

	return false;
}

/** Час по UTC: граница бюджета не должна зависеть от часового пояса. */
function hourOf(now: Date): string {
	return now.toISOString().slice(0, 13);
}

export type SuppressionReason =
	| "below-threshold"
	| "warnings-disabled"
	| "module-not-allowed"
	| "cooldown"
	| "hourly-budget";

export type Decision =
	| { send: true; stats: AlertStats }
	| { send: false; reason: SuppressionReason };

/**
 * Порог уровня и фильтр предупреждений. Не требует ни Redis, ни счётчиков и
 * принимается до любого ввода-вывода.
 */
export function passesFilters(
	severity: Severity,
	module: string | undefined,
	settings: AlertingSettings,
): SuppressionReason | null {
	if (!meetsThreshold(severity, settings.severityThreshold)) {
		return "below-threshold";
	}

	if (severity !== "warning") return null;

	if (!settings.warnings.enabled) return "warnings-disabled";

	const allowed = settings.warnings.allowedModules;
	if (allowed.length === 0) return null;

	// По префиксу: в списке `restock`, модуль приходит как `restock/worker`.
	return allowed.some((prefix) => (module ?? "").startsWith(prefix))
		? null
		: "module-not-allowed";
}

// ---------------------------------------------------------------------------
// Запасной механизм на случай недоступности Redis
// ---------------------------------------------------------------------------

type LocalState = {
	count: number;
	firstSeen: number;
	lastSeen: number;
	sendCount: number;
	lastReported: number;
	gateUntil: number;
};

const localState = new Map<string, LocalState>();
let localBudget = { hour: "", used: 0 };

function evaluateLocally(
	fingerprint: string,
	settings: AlertingSettings,
	now: Date,
): Decision {
	const ms = now.getTime();
	const existing = localState.get(fingerprint);
	const stale =
		existing !== undefined &&
		ms - existing.lastSeen > settings.cooldownResetSeconds * 1000;

	const state: LocalState =
		existing && !stale
			? existing
			: {
					count: 0,
					firstSeen: ms,
					lastSeen: ms,
					sendCount: 0,
					lastReported: 0,
					gateUntil: 0,
				};

	if (!localState.has(fingerprint) && localState.size >= LOCAL_STATE_LIMIT) {
		// Map хранит порядок вставки: первый ключ — самый старый.
		const oldest = localState.keys().next().value;
		if (oldest !== undefined) localState.delete(oldest);
	}

	state.count += 1;
	state.lastSeen = ms;
	localState.set(fingerprint, state);

	const burst = settings.burstEscalation && isBurstMilestone(state.count);

	if (state.gateUntil > ms && !burst) {
		return { send: false, reason: "cooldown" };
	}

	// Пауза ставится и тогда, когда письмо съест бюджет, — как и в Redis:
	// иначе каждый повтор внутри исчерпанного часа снова тратил бы решение.
	state.gateUntil = ms + cooldownSeconds(state.sendCount, settings) * 1000;

	const hour = hourOf(now);
	if (localBudget.hour !== hour) localBudget = { hour, used: 0 };

	localBudget.used += 1;

	if (localBudget.used > settings.maxMessagesPerHour) {
		return { send: false, reason: "hourly-budget" };
	}

	const suppressed = Math.max(0, state.count - state.lastReported - 1);
	const trigger: AlertTrigger =
		state.count === 1 ? "new" : burst ? "burst" : "cooldown-expired";

	state.sendCount += 1;
	state.lastReported = state.count;

	return {
		send: true,
		stats: {
			occurrences: state.count,
			firstSeen: new Date(state.firstSeen),
			lastSeen: new Date(state.lastSeen),
			suppressed,
			sendCount: state.sendCount,
			trigger,
			budgetExhausted: localBudget.used === settings.maxMessagesPerHour,
			budgetSuppressed: 0,
			degraded: true,
		},
	};
}

/** Только для тестов. */
export function resetLocalPolicyState(): void {
	localState.clear();
	localBudget = { hour: "", used: 0 };
}

// ---------------------------------------------------------------------------
// Основной путь
// ---------------------------------------------------------------------------

/**
 * Уходит ли письмо по этому происшествию и с какими счётчиками.
 *
 * Вызывается ПОСЛЕ записи в журнал: подавленное письмо не означает
 * потерянную ошибку — она уже в базе.
 */
export async function evaluate(
	fingerprint: string,
	severity: Severity,
	module: string | undefined,
	settings: AlertingSettings,
	now = new Date(),
): Promise<Decision> {
	const filtered = passesFilters(severity, module, settings);
	if (filtered) return { send: false, reason: filtered };

	const key = `alert:fp:${fingerprint}`;
	const gate = `alert:gate:${fingerprint}`;
	const budget = `alert:budget:${hourOf(now)}`;

	const result = await tryRedis<Decision>(async (redis) => {
		const iso = now.toISOString();

		// Счётчики обновляются всегда, даже когда письмо не уйдёт: из них
		// потом собирается строка «повторений: 127».
		const updated = await redis
			.multi()
			.hincrby(key, "count", 1)
			.hsetnx(key, "firstSeen", iso)
			.hset(key, "lastSeen", iso)
			.expire(key, settings.cooldownResetSeconds)
			.exec();

		const count = Number(updated?.[0]?.[1] ?? 1);
		const sendCount = Number((await redis.hget(key, "sendCount")) ?? 0);

		const burst = settings.burstEscalation && isBurstMilestone(count);
		const seconds = cooldownSeconds(sendCount, settings);
		const claimed = (await redis.set(gate, "1", "EX", seconds, "NX")) === "OK";

		if (!claimed && !burst) return { send: false, reason: "cooldown" };

		// Порог пробит, но замок от прошлой отправки — переставляем, иначе
		// всплеск после сотни продолжал бы слать письма.
		if (!claimed) await redis.set(gate, "1", "EX", seconds);

		const used = await redis.incr(budget);
		// TTL — только на первом инкременте часа. Безусловный EXPIRE сдвигал бы
		// окно с каждым письмом, и бюджет не обнулялся бы никогда.
		if (used === 1) await redis.expire(budget, 3_600);

		if (used > settings.maxMessagesPerHour) {
			await redis.incr(OVERFLOW_KEY);
			return { send: false, reason: "hourly-budget" };
		}

		const stored = await redis.hgetall(key);
		const lastReported = Number(stored.lastReported ?? 0);

		// Сколько писем съел лимит с прошлой отправки — и сразу обнулить,
		// чтобы число не прозвучало дважды.
		const overflow = Number((await redis.getdel(OVERFLOW_KEY)) ?? 0);

		await redis
			.multi()
			.hincrby(key, "sendCount", 1)
			.hset(key, "lastReported", count)
			.exec();

		const trigger: AlertTrigger =
			count === 1 ? "new" : claimed ? "cooldown-expired" : "burst";

		return {
			send: true,
			stats: {
				occurrences: count,
				firstSeen: new Date(stored.firstSeen ?? iso),
				lastSeen: now,
				suppressed: Math.max(0, count - lastReported - 1),
				sendCount: sendCount + 1,
				trigger,
				budgetExhausted: used === settings.maxMessagesPerHour,
				budgetSuppressed: overflow,
				degraded: false,
			},
		};
	});

	return result ?? evaluateLocally(fingerprint, settings, now);
}
