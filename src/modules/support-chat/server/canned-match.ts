import { sql } from "@payloadcms/db-postgres";
import type { SupportTopic } from "../lib/constants.ts";
import type { CannedSuggestionDTO } from "../lib/events.ts";
import { stemTerms } from "../lib/stem-ru.ts";
import { type Executor, intArray, num, query, str } from "./db.ts";

/**
 * Подсказки заготовок по тексту сообщения покупателя.
 *
 * Совпадение — по основам слов (русский стеммер Snowball, lib/stem-ru.ts):
 * фраза-триггер срабатывает, когда все её значимые слова есть в сообщении в
 * любой форме и порядке. «Есть ли у вас сертификаты?» совпадает с триггером
 * «сертификат», «декларации соответствия нужны» — с «декларация
 * соответствия».
 *
 * Сравнение делается в процессе приложения, а не to_tsvector в Postgres:
 * текст сообщения конфиденциален и не должен уходить в базу даже
 * параметром запроса (см. stem-ru.ts). Из базы читаются только заготовки —
 * их десятки, это дешевле любого кэша с инвалидацией между процессами.
 *
 * Ранжирование: число совпавших фраз × 1.5, если тема диалога среди тем
 * заготовки, × ln(использований + 2) — частые заготовки чуть выше.
 */

interface CannedRow {
	id: number;
	title: string;
	shortcut: string | null;
	body: string;
	usageCount: number;
	triggers: string[];
	topics: string[];
	documents: { id: number; title: string }[];
}

async function loadActiveCanned(
	db: Executor,
	options: { adminId: number; includePersonal: boolean },
): Promise<CannedRow[]> {
	const scope = options.includePersonal
		? sql`(c.scope = 'shared' OR c.owner_id = ${options.adminId})`
		: sql`c.scope = 'shared'`;
	const rows = await query(
		db,
		sql`SELECT c.id, c.title, c.shortcut, c.body, c.usage_count,
				COALESCE((SELECT array_agg(t.phrase) FROM support_canned_responses_triggers t
					WHERE t._parent_id = c.id), '{}') AS triggers,
				COALESCE((SELECT array_agg(tp.value::text) FROM support_canned_responses_topics tp
					WHERE tp.parent_id = c.id), '{}') AS topics,
				COALESCE((SELECT json_agg(json_build_object(
						'id', m.id,
						'title', COALESCE(NULLIF(m.caption, ''), NULLIF(m.alt, ''), m.filename)
					) ORDER BY r."order")
					FROM support_canned_responses_rels r
					JOIN media m ON m.id = r.media_id
					WHERE r.parent_id = c.id AND r.path = 'attachments'),
					'[]'::json) AS documents
			FROM support_canned_responses c
			WHERE c.is_active = TRUE AND ${scope}`,
	);
	return rows.map((row) => ({
		id: num(row.id),
		title: String(row.title),
		shortcut: str(row.shortcut),
		body: String(row.body),
		usageCount: num(row.usage_count),
		triggers: (row.triggers as string[]) ?? [],
		topics: (row.topics as string[]) ?? [],
		documents: ((row.documents as { id: unknown; title: unknown }[]) ?? []).map(
			(doc) => ({
				id: Number(doc.id),
				title: String(doc.title),
			}),
		),
	}));
}

/** Чистое сопоставление — для тестов без базы. */
export function rankCanned(
	text: string,
	topic: SupportTopic,
	candidates: readonly Pick<
		CannedRow,
		"id" | "triggers" | "topics" | "usageCount"
	>[],
): { id: number; score: number }[] {
	const terms = new Set(stemTerms(text));
	if (terms.size === 0) return [];

	const ranked: { id: number; score: number }[] = [];
	for (const candidate of candidates) {
		let hits = 0;
		for (const phrase of candidate.triggers) {
			const stems = stemTerms(phrase);
			if (stems.length > 0 && stems.every((stem) => terms.has(stem))) hits++;
		}
		if (hits === 0) continue;
		const topicBoost = candidate.topics.includes(topic) ? 1.5 : 1;
		ranked.push({
			id: candidate.id,
			score: hits * topicBoost * Math.log(candidate.usageCount + 2),
		});
	}
	return ranked.sort((a, b) => b.score - a.score || a.id - b.id);
}

export async function suggestCannedResponses(
	db: Executor,
	options: {
		text: string;
		topic: SupportTopic;
		adminId: number;
		/** Личные заготовки — только по запросу самого менеджера. */
		includePersonal: boolean;
		limit?: number;
	},
): Promise<CannedSuggestionDTO[]> {
	const candidates = await loadActiveCanned(db, options);
	const byId = new Map(candidates.map((c) => [c.id, c]));
	const top = rankCanned(options.text, options.topic, candidates).slice(
		0,
		options.limit ?? 3,
	);
	const suggestions = top.flatMap(({ id }) => {
		const canned = byId.get(id);
		return canned
			? [
					{
						id: canned.id,
						title: canned.title,
						shortcut: canned.shortcut,
						body: canned.body,
						documents: canned.documents,
					},
				]
			: [];
	});

	if (suggestions.length > 0) {
		// Учёт для отчёта «подсказывается, но не используется» — триггеры
		// такой заготовки стоит уточнить.
		await db.execute(
			sql`UPDATE support_canned_responses
				SET suggested_count = COALESCE(suggested_count, 0) + 1
				WHERE id = ANY(${intArray(suggestions.map((s) => s.id))})`,
		);
	}
	return suggestions;
}

/** Заготовку отправили — для сортировки подсказок и отчёта. */
export async function markCannedResponseUsed(
	db: Executor,
	cannedResponseId: number,
): Promise<void> {
	await db.execute(
		sql`UPDATE support_canned_responses
			SET usage_count = COALESCE(usage_count, 0) + 1, last_used_at = now()
			WHERE id = ${cannedResponseId}`,
	);
}

/** Все заготовки, доступные менеджеру, — для команды «/» в консоли. */
export async function listCannedForStaff(
	db: Executor,
	adminId: number,
): Promise<CannedSuggestionDTO[]> {
	const rows = await loadActiveCanned(db, { adminId, includePersonal: true });
	return rows
		.sort(
			(a, b) =>
				b.usageCount - a.usageCount || a.title.localeCompare(b.title, "ru"),
		)
		.map((row) => ({
			id: row.id,
			title: row.title,
			shortcut: row.shortcut,
			body: row.body,
			documents: row.documents,
		}));
}
