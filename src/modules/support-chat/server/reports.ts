import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import {
	CANNED_UNDERUSED_MAX_RATIO,
	CANNED_UNDERUSED_MIN_SUGGESTIONS,
	type SupportTopic,
} from "../lib/constants.ts";
import { drizzleOf, type Executor, num, numOrNull, query, str } from "./db.ts";
import { currentInterval } from "./eta.ts";
import { getSupportConfig, type SupportConfig } from "./settings.ts";

/**
 * Отчёты чата поддержки — /admin/support/reports.
 *
 * Только служебные цифры: время, количества, темы, метки, оценки. Текст
 * переписки сюда не попадает и попасть не может — он зашифрован, а отчёт
 * считается SQL-агрегатами. Обезличенные диалоги (срок хранения, удаление
 * аккаунта) в отчёте остаются: у них есть тема, менеджер, время и оценка, нет
 * только сообщений — поэтому счётчики сообщений за давние периоды меньше.
 *
 * Время первого ответа и нарушения срока считаются, как оценка «через
 * сколько ответим» (stats.ts): только для диалогов, начатых в рабочее время,
 * и срок — того интервала расписания, в котором диалог начат (будни 15 мин,
 * выходные — свой). Ночной вопрос, дождавшийся утра, нарушением не считается.
 */

export const REPORT_DAYS = [7, 30, 90, 365] as const;

export interface SupportReportDTO {
	period: { from: string; to: string; days: number; timezone: string };
	totals: {
		conversations: number;
		customerMessages: number;
		staffMessages: number;
		resolved: number;
		reopened: number;
	};
	/** По дням периода в поясе поддержки, без пропусков. */
	daily: { date: string; conversations: number; customerMessages: number }[];
	/** Сообщения покупателей: [день недели пн..вс][час 0..23]. */
	heatmap: number[][];
	firstResponse: {
		medianMinutes: number | null;
		p90Minutes: number | null;
		sample: number;
		/** Ответили позже срока или ещё не ответили, а срок вышел. */
		slaBreaches: number;
		slaSample: number;
	};
	resolution: {
		medianMinutes: number | null;
		p90Minutes: number | null;
		sample: number;
	};
	csat: { average: number | null; count: number; distribution: number[] };
	agents: {
		adminId: number;
		name: string;
		conversations: number;
		messages: number;
		medianFirstResponseMinutes: number | null;
		csatAverage: number | null;
		csatCount: number;
	}[];
	topics: { topic: SupportTopic; count: number }[];
	tags: { tag: string; count: number }[];
	canned: { id: number; title: string; uses: number }[];
	/**
	 * Заготовки, которые часто подсказываются, но редко вставляются, — за всё
	 * время (счётчики накопительные): слишком широкие фразы-триггеры или
	 * устаревший текст. По возрастанию доли использования.
	 */
	cannedUnderused: {
		id: number;
		title: string;
		suggested: number;
		used: number;
		/** used / suggested, 0…1 (может быть > 1: вставляют и через «/»). */
		ratio: number;
		lastUsedAt: string | null;
	}[];
}

export function percentile(
	values: readonly number[],
	p: number,
): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	// Линейная интерполяция — как percentile_cont в Postgres.
	const rank = (p / 100) * (sorted.length - 1);
	const low = Math.floor(rank);
	const high = Math.ceil(rank);
	const value = sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
	return Math.round(value * 10) / 10;
}

/** Чистая часть расчёта первого ответа — для тестов без базы. */
export function summarizeFirstResponse(
	rows: readonly {
		createdAt: Date;
		firstResponseAt: Date | null;
		assigneeId: number | null;
	}[],
	config: Pick<SupportConfig, "timezone" | "schedule" | "holidays" | "routing">,
	now: Date = new Date(),
): {
	all: number[];
	byAgent: Map<number, number[]>;
	slaBreaches: number;
	slaSample: number;
} {
	const all: number[] = [];
	const byAgent = new Map<number, number[]>();
	let slaBreaches = 0;
	let slaSample = 0;
	for (const row of rows) {
		const interval = currentInterval(row.createdAt, config);
		if (!interval) continue;
		const sla = interval.slaMinutes ?? config.routing.firstResponseSlaMinutes;
		const end = row.firstResponseAt ?? now;
		const minutes = (end.getTime() - row.createdAt.getTime()) / 60_000;
		if (minutes < 0) continue;

		if (row.firstResponseAt || minutes > sla) {
			// Без ответа и в пределах срока — исход ещё неизвестен, не считаем.
			slaSample++;
			if (minutes > sla) slaBreaches++;
		}
		if (!row.firstResponseAt) continue;
		all.push(minutes);
		if (row.assigneeId !== null) {
			const list = byAgent.get(row.assigneeId) ?? [];
			list.push(minutes);
			byAgent.set(row.assigneeId, list);
		}
	}
	return { all, byAgent, slaBreaches, slaSample };
}

function dateKeys(from: Date, days: number, timezone: string): string[] {
	const format = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	const keys = new Set<string>();
	for (let i = 0; i <= days; i++) {
		keys.add(format.format(new Date(from.getTime() + i * 86_400_000)));
	}
	return [...keys];
}

export async function buildSupportReport(
	payload: Payload,
	days: number,
	now: Date = new Date(),
): Promise<SupportReportDTO> {
	const db: Executor = drizzleOf(payload);
	const config = await getSupportConfig(payload);
	const tz = config.timezone;
	const from = new Date(now.getTime() - days * 86_400_000);
	const inPeriod = (column: string) =>
		sql`${sql.raw(column)} >= ${from.toISOString()}::timestamptz AND ${sql.raw(column)} < ${now.toISOString()}::timestamptz`;

	const [
		totalsRows,
		dailyConversations,
		dailyMessages,
		heatRows,
		firstRows,
		resolutionRows,
		csatRows,
		agentRows,
		messageRows,
		topicRows,
		tagRows,
		cannedRows,
		underusedRows,
	] = await Promise.all([
		query(
			db,
			sql`SELECT
				(SELECT count(*) FROM support_conversations c WHERE ${inPeriod("c.created_at")})::int AS conversations,
				(SELECT count(*) FROM support_conversations c WHERE ${inPeriod("c.resolved_at")})::int AS resolved,
				(SELECT coalesce(sum(c.reopened_count), 0) FROM support_conversations c WHERE ${inPeriod("c.created_at")})::int AS reopened,
				(SELECT count(*) FROM support_messages m WHERE m.author_type = 'customer' AND ${inPeriod("m.created_at")})::int AS customer_messages,
				(SELECT count(*) FROM support_messages m WHERE m.author_type = 'staff' AND m.kind = 'text' AND ${inPeriod("m.created_at")})::int AS staff_messages`,
		),
		query(
			db,
			sql`SELECT to_char(c.created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, count(*)::int AS n
				FROM support_conversations c WHERE ${inPeriod("c.created_at")}
				GROUP BY 1`,
		),
		query(
			db,
			sql`SELECT to_char(m.created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, count(*)::int AS n
				FROM support_messages m
				WHERE m.author_type = 'customer' AND ${inPeriod("m.created_at")}
				GROUP BY 1`,
		),
		query(
			db,
			sql`SELECT extract(isodow FROM m.created_at AT TIME ZONE ${tz})::int AS dow,
					extract(hour FROM m.created_at AT TIME ZONE ${tz})::int AS hour,
					count(*)::int AS n
				FROM support_messages m
				WHERE m.author_type = 'customer' AND ${inPeriod("m.created_at")}
				GROUP BY 1, 2`,
		),
		query(
			db,
			sql`SELECT c.created_at, c.first_response_at, c.assignee_id
				FROM support_conversations c WHERE ${inPeriod("c.created_at")}`,
		),
		query(
			db,
			sql`SELECT
					percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM c.resolved_at - c.created_at) / 60) AS median,
					percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM c.resolved_at - c.created_at) / 60) AS p90,
					count(*)::int AS n
				FROM support_conversations c
				WHERE ${inPeriod("c.resolved_at")}`,
		),
		query(
			db,
			sql`SELECT c.csat_score::int AS score, count(*)::int AS n
				FROM support_conversations c
				WHERE c.csat_score IS NOT NULL AND ${inPeriod("c.resolved_at")}
				GROUP BY 1`,
		),
		query(
			db,
			sql`SELECT a.id, coalesce(nullif(trim(a.support_display_name), ''), a.name, a.email) AS name,
					count(c.id)::int AS conversations,
					avg(c.csat_score) AS csat_avg,
					count(c.csat_score)::int AS csat_count
				FROM support_conversations c
				JOIN admins a ON a.id = c.assignee_id
				WHERE ${inPeriod("c.created_at")}
				GROUP BY a.id`,
		),
		query(
			db,
			sql`SELECT m.author_admin_id AS id, count(*)::int AS n
				FROM support_messages m
				WHERE m.author_type = 'staff' AND m.kind = 'text' AND ${inPeriod("m.created_at")}
				GROUP BY 1`,
		),
		query(
			db,
			sql`SELECT c.topic, count(*)::int AS n FROM support_conversations c
				WHERE ${inPeriod("c.created_at")} GROUP BY 1 ORDER BY 2 DESC`,
		),
		query(
			db,
			sql`SELECT t.text AS tag, count(*)::int AS n
				FROM support_conversations_texts t
				JOIN support_conversations c ON c.id = t.parent_id
				WHERE t.path = 'tags' AND ${inPeriod("c.created_at")}
				GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
		),
		query(
			db,
			sql`SELECT r.id, r.title, count(*)::int AS n
				FROM support_messages m
				JOIN support_canned_responses r ON r.id = m.canned_response_id
				WHERE ${inPeriod("m.created_at")}
				GROUP BY r.id, r.title ORDER BY 3 DESC LIMIT 15`,
		),
		// Только общие активные: личные заготовки менеджер подбирает себе сам.
		query(
			db,
			sql`SELECT id, title,
					COALESCE(suggested_count, 0)::float AS suggested,
					COALESCE(usage_count, 0)::float AS used,
					last_used_at
				FROM support_canned_responses
				WHERE is_active IS NOT FALSE AND scope = 'shared'
					AND COALESCE(suggested_count, 0) >= ${CANNED_UNDERUSED_MIN_SUGGESTIONS}
					AND COALESCE(usage_count, 0)
						< COALESCE(suggested_count, 0) * ${CANNED_UNDERUSED_MAX_RATIO}
				ORDER BY COALESCE(usage_count, 0) / COALESCE(suggested_count, 1),
					suggested_count DESC
				LIMIT 15`,
		),
	]);

	const totals = totalsRows[0] ?? {};

	const conversationsByDay = new Map(
		dailyConversations.map((r) => [String(r.day), num(r.n)]),
	);
	const messagesByDay = new Map(
		dailyMessages.map((r) => [String(r.day), num(r.n)]),
	);
	const daily = dateKeys(from, days, tz).map((date) => ({
		date,
		conversations: conversationsByDay.get(date) ?? 0,
		customerMessages: messagesByDay.get(date) ?? 0,
	}));

	const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
	for (const row of heatRows) {
		heatmap[num(row.dow) - 1][num(row.hour)] = num(row.n);
	}

	const first = summarizeFirstResponse(
		firstRows.map((row) => ({
			createdAt: new Date(String(row.created_at)),
			firstResponseAt: row.first_response_at
				? new Date(String(row.first_response_at))
				: null,
			assigneeId: numOrNull(row.assignee_id),
		})),
		config,
		now,
	);

	const distribution = [0, 0, 0, 0, 0];
	for (const row of csatRows) {
		const score = num(row.score);
		if (score >= 1 && score <= 5) distribution[score - 1] = num(row.n);
	}
	const csatCount = distribution.reduce((a, b) => a + b, 0);
	const csatSum = distribution.reduce((a, n, i) => a + n * (i + 1), 0);

	const messagesByAgent = new Map(
		messageRows.map((r) => [num(r.id), num(r.n)]),
	);
	const round = (value: number | null) =>
		value === null ? null : Math.round(value * 10) / 10;

	return {
		period: {
			from: from.toISOString(),
			to: now.toISOString(),
			days,
			timezone: tz,
		},
		totals: {
			conversations: num(totals.conversations),
			customerMessages: num(totals.customer_messages),
			staffMessages: num(totals.staff_messages),
			resolved: num(totals.resolved),
			reopened: num(totals.reopened),
		},
		daily,
		heatmap,
		firstResponse: {
			medianMinutes: percentile(first.all, 50),
			p90Minutes: percentile(first.all, 90),
			sample: first.all.length,
			slaBreaches: first.slaBreaches,
			slaSample: first.slaSample,
		},
		resolution: {
			medianMinutes: round(numOrNull(resolutionRows[0]?.median)),
			p90Minutes: round(numOrNull(resolutionRows[0]?.p90)),
			sample: num(resolutionRows[0]?.n),
		},
		csat: {
			average: csatCount ? Math.round((csatSum / csatCount) * 100) / 100 : null,
			count: csatCount,
			distribution,
		},
		agents: agentRows
			.map((row) => {
				const adminId = num(row.id);
				return {
					adminId,
					name: str(row.name) ?? `Менеджер №${adminId}`,
					conversations: num(row.conversations),
					messages: messagesByAgent.get(adminId) ?? 0,
					medianFirstResponseMinutes: percentile(
						first.byAgent.get(adminId) ?? [],
						50,
					),
					csatAverage:
						row.csat_avg === null
							? null
							: Math.round(Number(row.csat_avg) * 100) / 100,
					csatCount: num(row.csat_count),
				};
			})
			.sort((a, b) => b.conversations - a.conversations),
		topics: topicRows.map((row) => ({
			topic: String(row.topic) as SupportTopic,
			count: num(row.n),
		})),
		tags: tagRows.map((row) => ({ tag: String(row.tag), count: num(row.n) })),
		canned: cannedRows.map((row) => ({
			id: num(row.id),
			title: String(row.title),
			uses: num(row.n),
		})),
		cannedUnderused: underusedRows.map((row) => {
			const suggested = num(row.suggested);
			const used = num(row.used);
			return {
				id: num(row.id),
				title: String(row.title),
				suggested,
				used,
				ratio: suggested > 0 ? used / suggested : 0,
				lastUsedAt: row.last_used_at
					? new Date(row.last_used_at as string).toISOString()
					: null,
			};
		}),
	};
}
