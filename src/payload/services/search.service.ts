import { sql } from "@payloadcms/db-postgres";
import type { Product } from "../../../payload-types";
import { mapFaqTopics } from "../../modules/faq/lib/mapper";
import {
	buildTsQuery,
	normalizeForSearch,
} from "../../modules/knowledge/lib/search";
import {
	SEARCH_CANDIDATE_LIMIT,
	SEARCH_INITIAL_LIMIT,
	SEARCH_MAX_QUERY_LENGTH,
	SEARCH_MIN_QUERY_LENGTH,
} from "../../modules/search/constants";
import { mapProductToSearchResult } from "../../modules/search/lib/adapter";
import {
	matchesAllTerms,
	orderSections,
	type SecondaryMatch,
	scoreResult,
	sortByScore,
} from "../../modules/search/lib/ranking";
import type {
	SearchResponse,
	SearchResultFaq,
	SearchResultKnowledge,
	SearchResultProduct,
	SearchResultType,
	SearchSection,
} from "../../modules/search/types";
import { getCachedFaqTopics } from "./faq.service";
import { getPayloadInstance } from "./getPayload";
import { searchKnowledgeTopics } from "./knowledge.service";

/**
 * Поиск в шапке сайта: товары, база знаний, FAQ — одним запросом.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * КАК УСТРОЕНО
 * ════════════════════════════════════════════════════════════════════════════
 * Каждый источник отбирает КАНДИДАТОВ своим штатным способом:
 *
 *   • товары — одним SQL: полнотекстовый поиск Postgres ('russian', основы
 *     слов + префиксы) по названию, описанию и видимым характеристикам, плюс
 *     подстрока по названию и значениям характеристик — для артикулов и
 *     обозначений вроде «БС-2» или «P10v2», которые стеммер режет на куски;
 *   • статьи — тем же поиском, что и страница /knowledge
 *     (searchKnowledgeTopics, GIN-индекс по searchText);
 *   • FAQ — перебором кэшированного списка: вопросов десятки, и
 *     страница /faq ищет по ним так же.
 *
 * Затем все кандидаты оцениваются ОДНОЙ функцией (modules/search/lib/ranking)
 * — она и решает порядок внутри секции и порядок самих секций.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ПОЧЕМУ БЕЗ ИНДЕКСОВ НА ТОВАРАХ
 * ════════════════════════════════════════════════════════════════════════════
 * Каталог — сотни позиций, не сотни тысяч. На таком объёме Postgres всё равно
 * выбирает последовательное чтение (оно дешевле похода в индекс), и весь
 * запрос занимает единицы миллисекунд. GIN-индекс здесь только замедлил бы
 * запись и занял место. У статей индекс есть, потому что их текст — длинный.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ОПЕЧАТКИ
 * ════════════════════════════════════════════════════════════════════════════
 * Если точных совпадений среди товаров нет, названия сравниваются по
 * триграммам (pg_trgm, word_similarity): «вултр» находит «Вултур». Это
 * запасной путь, а не основной — нечёткое сравнение на каждом запросе
 * подмешивало бы шум в хорошую выдачу. Расширение ставит миграция
 * 20260927_120000_search_trgm; если прав на него не хватило, поиск просто
 * работает без исправления опечаток.
 */

type PayloadInstance = Awaited<ReturnType<typeof getPayloadInstance>>;

/** Запрос, приведённый к виду, с которым работают все источники. */
interface PreparedQuery {
	/** Как ввёл пользователь, но в пределах длины. */
	raw: string;
	/** Нижний регистр, ё→е, пробелы схлопнуты; пунктуация СОХРАНЕНА. */
	phrase: string;
	/** Запрос для to_tsquery или null, если значимых слов нет. */
	tsQuery: string | null;
}

export function prepareQuery(input: string): PreparedQuery | null {
	const raw = input.trim().slice(0, SEARCH_MAX_QUERY_LENGTH);
	if (raw.length < SEARCH_MIN_QUERY_LENGTH) return null;

	const phrase = raw.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
	const tsQuery = buildTsQuery(raw);

	// Запрос целиком из знаков препинания: искать нечего.
	if (!tsQuery && !normalizeForSearch(raw)) return null;

	return { raw, phrase, tsQuery };
}

/** Экранирование для LIKE: пользовательские % и _ — обычные символы. */
function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function rowsOf<T>(raw: unknown): T[] {
	return (
		Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] })?.rows ?? [])
	) as T[];
}

// ── Товары ──────────────────────────────────────────────────────────────────

interface ProductCandidateRow {
	id: number;
	title: string;
	status: string | null;
	title_fts: boolean;
	title_sub: boolean;
	desc_fts: boolean;
	spec_name: string | null;
	spec_value: string | null;
	spec_unit: string | null;
	similarity: number | null;
}

interface ProductCandidate {
	id: number;
	score: number;
	matchedSpec: SearchResultProduct["matchedSpec"];
}

/**
 * Условие «товар продаётся на витрине» — то же, что было у прежнего поиска
 * (опубликован, не снят с производства, не скрыт). IS DISTINCT FROM, а не
 * `<>`: у товара без статуса значение NULL, и `<>` молча выкинул бы его.
 */
const PRODUCT_VISIBLE = sql`
	p."_status" = 'published'
	AND p."inventory_status" IS DISTINCT FROM 'discontinued'
	AND p."inventory_is_visible" IS NOT FALSE`;

/**
 * Кандидаты среди товаров, по убыванию грубой релевантности (её уточнит
 * ranking). Характеристики учитываются только видимые покупателю: найти
 * товар по тексту, которого на его странице нет, значит показать результат,
 * который невозможно понять.
 */
async function findProductCandidates(
	payload: PayloadInstance,
	query: PreparedQuery,
): Promise<ProductCandidateRow[]> {
	const like = `%${escapeLike(query.phrase)}%`;

	const rows = await payload.db.drizzle.execute(sql`
		WITH q AS (
			SELECT CASE WHEN ${query.tsQuery}::text IS NULL THEN NULL
				ELSE to_tsquery('russian', ${query.tsQuery}::text) END AS tsq
		),
		base AS (
			SELECT
				p."id",
				pl."title",
				pl."description",
				p."inventory_status" AS status,
				coalesce(p."analytics_views_count", 0) AS views,
				(
					SELECT string_agg(concat_ws(' ', s."name", s."value", s."unit"), ' ')
					FROM "products_specifications" s
					WHERE s."_parent_id" = p."id" AND s."is_visible" IS NOT FALSE
				) AS specs
			FROM "products" p
			JOIN "products_locales" pl
				ON pl."_parent_id" = p."id" AND pl."_locale" = 'ru'
			WHERE ${PRODUCT_VISIBLE}
		),
		matched AS (
			SELECT
				b.*,
				coalesce(to_tsvector('russian', coalesce(b."title", '')) @@ q.tsq, false) AS title_fts,
				translate(lower(coalesce(b."title", '')), 'ё', 'е') LIKE ${like} AS title_sub,
				coalesce(to_tsvector('russian', coalesce(b."description", '')) @@ q.tsq, false) AS desc_fts,
				coalesce(
					to_tsvector('russian',
						coalesce(b."title", '') || ' ' || coalesce(b."description", '') || ' ' || coalesce(b.specs, '')
					) @@ q.tsq,
					false
				) AS any_fts,
				ts_rank(
					to_tsvector('russian', coalesce(b."title", '') || ' ' || coalesce(b."description", '')),
					coalesce(q.tsq, ''::tsquery)
				) AS rank
			FROM base b, q
		)
		SELECT
			m."id",
			m."title",
			m.status,
			m.title_fts,
			m.title_sub,
			m.desc_fts,
			sp."name" AS spec_name,
			sp."value" AS spec_value,
			sp."unit" AS spec_unit,
			NULL::real AS similarity
		FROM matched m
		CROSS JOIN q
		-- Первая характеристика, в которой нашёлся запрос, — её покажет строка
		-- выдачи. Считается только для отобранных строк.
		LEFT JOIN LATERAL (
			SELECT s."name", s."value", s."unit"
			FROM "products_specifications" s
			WHERE s."_parent_id" = m."id"
				AND s."is_visible" IS NOT FALSE
				AND (
					translate(lower(s."value"), 'ё', 'е') LIKE ${like}
					OR coalesce(to_tsvector('russian', s."name" || ' ' || s."value") @@ q.tsq, false)
				)
			ORDER BY s."_order"
			LIMIT 1
		) sp ON true
		WHERE m.title_fts OR m.title_sub OR m.desc_fts OR m.any_fts OR sp."name" IS NOT NULL
		ORDER BY
			(m.title_sub OR m.title_fts) DESC,
			m.rank DESC,
			m.views DESC,
			m."id"
		LIMIT ${SEARCH_CANDIDATE_LIMIT};
	`);

	return rowsOf<ProductCandidateRow>(rows);
}

let trigramAvailable: Promise<boolean> | null = null;

/** Установлено ли pg_trgm. Проверяется один раз на процесс. */
function hasTrigram(payload: PayloadInstance): Promise<boolean> {
	trigramAvailable ??= payload.db.drizzle
		.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`)
		.then((rows) => rowsOf(rows).length > 0)
		.catch(() => false);
	return trigramAvailable;
}

/**
 * Порог сходства слов. 0.5 пропускает одну пропущенную или лишнюю букву в
 * слове из 5–7 букв («вултр», «сеткамет») и отсекает случайные созвучия.
 */
const FUZZY_THRESHOLD = 0.5;
const FUZZY_LIMIT = 20;

/** Товары с похожим названием — только когда точных совпадений нет. */
async function findProductsBySimilarity(
	payload: PayloadInstance,
	query: PreparedQuery,
): Promise<ProductCandidateRow[]> {
	if (!(await hasTrigram(payload))) return [];

	const rows = await payload.db.drizzle.execute(sql`
		SELECT * FROM (
			SELECT
				p."id",
				pl."title",
				p."inventory_status" AS status,
				false AS title_fts,
				false AS title_sub,
				false AS desc_fts,
				NULL AS spec_name,
				NULL AS spec_value,
				NULL AS spec_unit,
				word_similarity(${query.phrase}, translate(lower(pl."title"), 'ё', 'е')) AS similarity
			FROM "products" p
			JOIN "products_locales" pl
				ON pl."_parent_id" = p."id" AND pl."_locale" = 'ru'
			WHERE ${PRODUCT_VISIBLE}
		) t
		WHERE t.similarity >= ${FUZZY_THRESHOLD}
		ORDER BY t.similarity DESC, t."id"
		LIMIT ${FUZZY_LIMIT};
	`);

	return rowsOf<ProductCandidateRow>(rows);
}

function secondaryOf(row: ProductCandidateRow): SecondaryMatch | null {
	if (row.spec_name) return "spec";
	if (row.desc_fts) return "description";
	return null;
}

function scoreProducts(
	rows: ProductCandidateRow[],
	query: PreparedQuery,
): ProductCandidate[] {
	const candidates = rows.map((row) => ({
		id: Number(row.id),
		score: scoreResult({
			type: "product",
			query: query.raw,
			title: row.title ?? "",
			secondary: secondaryOf(row),
			available: row.status !== "out_of_stock",
			similarity: row.similarity === null ? undefined : Number(row.similarity),
		}),
		matchedSpec:
			row.spec_name && row.spec_value
				? {
						name: row.spec_name,
						value: row.spec_value,
						unit: row.spec_unit,
					}
				: null,
	}));
	return sortByScore(candidates, (candidate) => candidate.score);
}

/**
 * Документы товаров для показа — только для нужной страницы, одним find по
 * списку id (цены, картинки, категория — через штатный адаптер, чтобы цена в
 * поиске совпадала с карточкой).
 */
async function loadProducts(
	payload: PayloadInstance,
	page: ProductCandidate[],
): Promise<SearchResultProduct[]> {
	if (page.length === 0) return [];

	const result = await payload.find({
		collection: "products",
		where: { id: { in: page.map((candidate) => candidate.id) } },
		locale: "ru",
		limit: page.length,
		depth: 1,
		pagination: false,
		overrideAccess: true,
	});

	const byId = new Map(
		(result.docs as unknown as Product[]).map((doc) => [doc.id, doc]),
	);

	return page.flatMap((candidate) => {
		const doc = byId.get(candidate.id);
		return doc ? [mapProductToSearchResult(doc, candidate.matchedSpec)] : [];
	});
}

async function searchProductSection(
	payload: PayloadInstance,
	query: PreparedQuery,
	offset: number,
	limit: number,
): Promise<{ section: SearchSection; topScore: number }> {
	let rows = await findProductCandidates(payload, query);
	const approximate = rows.length === 0;
	if (approximate) rows = await findProductsBySimilarity(payload, query);

	const ranked = scoreProducts(rows, query);
	const items = await loadProducts(
		payload,
		ranked.slice(offset, offset + limit),
	);

	return {
		section: { type: "product", items, total: ranked.length, approximate },
		topScore: ranked[0]?.score ?? 0,
	};
}

// ── База знаний ─────────────────────────────────────────────────────────────

async function searchKnowledgeSection(
	query: PreparedQuery,
	offset: number,
	limit: number,
): Promise<{ section: SearchSection; topScore: number }> {
	const result = query.tsQuery
		? await searchKnowledgeTopics({
				q: query.raw,
				page: 1,
				pageSize: SEARCH_CANDIDATE_LIMIT,
			})
		: null;

	const hits = (result?.hits ?? []).filter((hit) => hit.categorySlug);
	const scored = hits.map((hit) => ({
		hit,
		score: scoreResult({
			type: "knowledge",
			query: query.raw,
			title: hit.title,
			// Статья попала в кандидаты полнотекстовым поиском по всему тексту,
			// значит совпадение вне заголовка есть наверняка.
			secondary: "body",
		}),
	}));
	const ranked = sortByScore(scored, (entry) => entry.score);

	const items: SearchResultKnowledge[] = ranked
		.slice(offset, offset + limit)
		.map(({ hit }) => ({
			id: String(hit.id),
			title: hit.title,
			href: `/knowledge/${hit.categorySlug}/${hit.slug}`,
			categoryTitle: hit.categoryTitle,
			snippet: hit.snippet ?? hit.description,
		}));

	return {
		section: {
			type: "knowledge",
			items,
			total: ranked.length,
			approximate: false,
		},
		topScore: ranked[0]?.score ?? 0,
	};
}

// ── FAQ ─────────────────────────────────────────────────────────────────────

/** Длина фрагмента ответа под вопросом. */
const FAQ_SNIPPET_LENGTH = 140;

function clip(text: string, length: number): string {
	if (text.length <= length) return text;
	const cut = text.slice(0, length);
	return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : length)}…`;
}

/**
 * Вопрос подходит, если в нём, в ответе или в названии темы есть ВСЕ слова
 * запроса (как у статей: `&`, а не `|`) либо запрос стоит целой фразой.
 */
async function searchFaqSection(
	query: PreparedQuery,
	offset: number,
	limit: number,
): Promise<{ section: SearchSection; topScore: number }> {
	const topics = mapFaqTopics(await getCachedFaqTopics());

	const scored: Array<{ item: SearchResultFaq; score: number }> = [];
	for (const topic of topics) {
		for (const question of topic.questions) {
			const context = `${topic.title} ${question.plainAnswer}`;
			const inQuestion =
				matchesAllTerms(query.raw, question.question) ||
				normalizeForSearch(question.question).includes(
					normalizeForSearch(query.raw),
				);
			const inContext =
				matchesAllTerms(query.raw, `${question.question} ${context}`) ||
				normalizeForSearch(context).includes(normalizeForSearch(query.raw));
			if (!inQuestion && !inContext) continue;

			scored.push({
				item: {
					id: question.id,
					question: question.question,
					href: `/faq#${encodeURIComponent(question.slug)}`,
					topicTitle: topic.title,
					snippet: question.plainAnswer
						? clip(question.plainAnswer, FAQ_SNIPPET_LENGTH)
						: null,
				},
				score: scoreResult({
					type: "faq",
					query: query.raw,
					title: question.question,
					secondary: inContext ? "body" : null,
				}),
			});
		}
	}

	const ranked = sortByScore(scored, (entry) => entry.score);
	return {
		section: {
			type: "faq",
			items: ranked.slice(offset, offset + limit).map((entry) => entry.item),
			total: ranked.length,
			approximate: false,
		},
		topScore: ranked[0]?.score ?? 0,
	};
}

// ── Точки входа ─────────────────────────────────────────────────────────────

async function searchSection(
	payload: PayloadInstance,
	type: SearchResultType,
	query: PreparedQuery,
	offset: number,
	limit: number,
) {
	switch (type) {
		case "product":
			return searchProductSection(payload, query, offset, limit);
		case "knowledge":
			return searchKnowledgeSection(query, offset, limit);
		case "faq":
			return searchFaqSection(query, offset, limit);
	}
}

/**
 * Первые порции всех источников, секции — по релевантности. Источники
 * опрашиваются параллельно: общий ответ ждёт самый медленный из них, а не
 * их сумму.
 */
export async function searchSite(input: string): Promise<SearchResponse> {
	const query = prepareQuery(input);
	if (!query) return { query: input.trim(), sections: [], total: 0 };

	const payload = await getPayloadInstance();
	const types: SearchResultType[] = ["product", "knowledge", "faq"];
	const results = await Promise.all(
		types.map((type) =>
			searchSection(payload, type, query, 0, SEARCH_INITIAL_LIMIT[type]),
		),
	);

	const sections = orderSections(
		results.map(({ section, topScore }) => ({
			section,
			topScore,
			size: section.items.length,
		})),
	);

	return {
		query: query.raw,
		sections,
		total: sections.reduce((sum, section) => sum + section.total, 0),
	};
}

/** Следующая порция одной секции — для «Показать ещё». */
export async function searchSiteSection(
	input: string,
	type: SearchResultType,
	offset: number,
	limit: number,
): Promise<SearchSection> {
	const query = prepareQuery(input);
	if (!query)
		return { type, items: [], total: 0, approximate: false } as SearchSection;

	const payload = await getPayloadInstance();
	const { section } = await searchSection(payload, type, query, offset, limit);
	return section;
}
