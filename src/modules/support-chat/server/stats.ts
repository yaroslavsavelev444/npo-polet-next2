import { sql } from "@payloadcms/db-postgres";
import type Redis from "ioredis";
import { type Executor, query } from "./db.ts";
import { currentInterval } from "./eta.ts";
import type { SupportConfig } from "./settings.ts";

/**
 * Статистика времени первого ответа — основа оценки «через сколько ответим».
 *
 * Считается фоном (раз в 5 минут, периодические задачи шлюза) и кладётся в
 * Redis: оценку показывает каждая кнопка чата на витрине, и на каждый показ
 * ходить в базу незачем.
 *
 * В выборку идут диалоги за 14 дней, начатые в рабочее время: ночной вопрос,
 * дождавшийся утра, не должен делать оценку дневного ответа «12 часов».
 * Будни и выходные — раздельно: в выходные отвечают медленнее (решение
 * владельца), и смешанная медиана врала бы в обе стороны.
 *
 * Пока диалогов мало (< MIN_SAMPLE), статистики нет и оценка берётся из
 * настроек — пять случайных диалогов не основание для обещаний.
 */

const KEY = "support:eta-stats";
const TTL_SECONDS = 30 * 60;
const WINDOW_DAYS = 14;
export const MIN_SAMPLE = 5;

export type DayType = "weekday" | "weekend";

export interface FirstResponseStats {
	/** Медиана первого ответа, минуты; null — мало данных. */
	medianMinutes: Record<DayType, number | null>;
	sample: Record<DayType, number>;
	computedAt: string;
}

export function dayTypeOf(weekday: string): DayType {
	return weekday === "sat" || weekday === "sun" ? "weekend" : "weekday";
}

function median(values: number[]): number | null {
	if (values.length < MIN_SAMPLE) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[middle]
		: (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Чистая часть — для тестов без базы. */
export function summarizeFirstResponses(
	rows: readonly { createdAt: Date; firstResponseAt: Date }[],
	config: Pick<SupportConfig, "timezone" | "schedule" | "holidays">,
	now: Date = new Date(),
): FirstResponseStats {
	const buckets: Record<DayType, number[]> = { weekday: [], weekend: [] };
	for (const row of rows) {
		const interval = currentInterval(row.createdAt, config);
		if (!interval) continue;
		const minutes =
			(row.firstResponseAt.getTime() - row.createdAt.getTime()) / 60_000;
		if (minutes < 0) continue;
		buckets[dayTypeOf(interval.day)].push(minutes);
	}
	return {
		medianMinutes: {
			weekday: median(buckets.weekday),
			weekend: median(buckets.weekend),
		},
		sample: {
			weekday: buckets.weekday.length,
			weekend: buckets.weekend.length,
		},
		computedAt: now.toISOString(),
	};
}

export async function computeFirstResponseStats(
	db: Executor,
	config: SupportConfig,
): Promise<FirstResponseStats> {
	const rows = await query(
		db,
		sql`SELECT created_at, first_response_at FROM support_conversations
			WHERE first_response_at IS NOT NULL
				AND created_at > now() - make_interval(days => ${WINDOW_DAYS})`,
	);
	return summarizeFirstResponses(
		rows.map((row) => ({
			createdAt: new Date(String(row.created_at)),
			firstResponseAt: new Date(String(row.first_response_at)),
		})),
		config,
	);
}

export async function storeStats(
	redis: Redis,
	stats: FirstResponseStats,
): Promise<void> {
	await redis.set(KEY, JSON.stringify(stats), "EX", TTL_SECONDS);
}

export async function readStats(
	redis: Redis,
): Promise<FirstResponseStats | null> {
	try {
		const raw = await redis.get(KEY);
		return raw ? (JSON.parse(raw) as FirstResponseStats) : null;
	} catch {
		// Нет статистики — оценка по настройкам; витрина не должна падать из-за Redis.
		return null;
	}
}

/** Типичное время первого ответа для текущего интервала расписания. */
export function typicalForNow(
	stats: FirstResponseStats | null,
	config: Pick<SupportConfig, "timezone" | "schedule" | "holidays">,
	now: Date = new Date(),
): number | null {
	const interval = currentInterval(now, config);
	if (!stats || !interval) return null;
	return stats.medianMinutes[dayTypeOf(interval.day)];
}
