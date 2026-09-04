// src/payload/services/knowledge.service.ts
//
// Слой данных базы знаний. Единственное место, где модуль обращается к Payload.
//
// Три правила, общие для всего файла:
//
// 1. Публичные выборки ВСЕГДА содержат `_status: published`. Local API по
//    умолчанию идёт с overrideAccess: true, то есть access-контроль коллекции
//    (см. KnowledgeTopics.access.read) в этих вызовах не срабатывает — условие
//    здесь и есть настоящая граница между черновиком и публикацией.
// 2. Списки не тянут `content` и `searchText`: это самые тяжёлые поля
//    коллекции, и в карточке они не нужны.
// 3. Кэш — один общий тег "knowledge" на весь модуль. Разделы, секции и статьи
//    всегда читаются вместе, и раздельная инвалидация давала бы
//    рассогласованную выдачу.

import { sql } from "@payloadcms/db-postgres";
import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type {
	KnowledgeCategory,
	KnowledgeSection,
	KnowledgeTopic,
	Media,
} from "../../../payload-types";
import { env } from "../../env";
import {
	OVERVIEW_TOPIC_LIMIT,
	SEARCH_PAGE_SIZE,
} from "../../modules/knowledge/lib/constants";
import {
	buildSnippet,
	buildTsQuery,
	toHighlightStems,
} from "../../modules/knowledge/lib/search";
import type {
	KnowledgeArticle,
	KnowledgeCategoryTree,
	KnowledgeGroup,
	KnowledgeOverview,
	KnowledgeSearchResult,
	KnowledgeTopicSummary,
	MediaLike,
} from "../../modules/knowledge/types";
import { getPayloadInstance } from "./getPayload";

const KNOWLEDGE_TAG = "knowledge";

/** Единственное условие видимости материала для анонимного посетителя. */
const PUBLISHED: Where = { _status: { equals: "published" } };

/** Поля, достаточные для карточки в списке. */
const SUMMARY_SELECT = {
	title: true,
	slug: true,
	description: true,
	readingTime: true,
	publishedAt: true,
	updatedAt: true,
	featured: true,
	position: true,
	category: true,
	section: true,
	image: true,
} as const;

/** То же плюс поисковый индекс — нужен только выдаче поиска (для сниппетов). */
const SEARCH_SELECT = { ...SUMMARY_SELECT, searchText: true } as const;

/**
 * В development кэш Next мешает: правки в админке должны быть видны сразу.
 * Тот же приём, что во всех остальных сервисах проекта.
 */
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
	if (env.NODE_ENV === "development") return fn();
	return unstable_cache(fn, [key], {
		tags: [KNOWLEDGE_TAG],
		revalidate: false,
	})();
}

// ── Нормализация ────────────────────────────────────────────────────────────

function relationId(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? null : parsed;
	}
	if (typeof value === "object") {
		const id = (value as { id?: unknown }).id;
		return typeof id === "number" ? id : null;
	}
	return null;
}

function mediaOf(value: MediaLike): Media | null {
	return value && typeof value === "object" ? (value as Media) : null;
}

function toImage(value: MediaLike, fallbackAlt: string) {
	const media = mediaOf(value);
	if (!media?.url) return null;
	return {
		url: media.url,
		// Пустой alt лучше выдуманного: если картинка чисто декоративная,
		// скринридер её пропустит. Заголовок статьи подставляем только когда
		// alt не задан вовсе — тогда изображение точно несёт смысл.
		alt: media.alt ?? fallbackAlt,
		width: media.width ?? null,
		height: media.height ?? null,
	};
}

function toSummary(
	doc: Partial<KnowledgeTopic> & { id: number },
	categories: Map<number, KnowledgeCategory>,
): KnowledgeTopicSummary {
	const categoryId = relationId(doc.category);
	const category = categoryId !== null ? categories.get(categoryId) : undefined;

	return {
		id: doc.id,
		title: doc.title ?? "",
		slug: doc.slug ?? "",
		description: doc.description ?? null,
		readingTime: doc.readingTime ?? null,
		publishedAt: doc.publishedAt ?? null,
		updatedAt: doc.updatedAt ?? "",
		featured: Boolean(doc.featured),
		position: doc.position ?? 0,
		categoryId,
		categorySlug: category?.slug ?? null,
		categoryTitle: category?.title ?? null,
		sectionId: relationId(doc.section),
		image: toImage(doc.image, doc.title ?? ""),
	};
}

/** Общий порядок материалов: сначала `position`, при равенстве — по названию. */
function byPosition(
	a: KnowledgeTopicSummary,
	b: KnowledgeTopicSummary,
): number {
	return a.position - b.position || a.title.localeCompare(b.title, "ru");
}

// ── Разделы и секции ────────────────────────────────────────────────────────

async function fetchCategories(): Promise<KnowledgeCategory[]> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "knowledge-categories",
		where: { isActive: { equals: true } },
		sort: ["order", "title"],
		limit: 200,
		pagination: false,
		depth: 0,
	});
	return result.docs as KnowledgeCategory[];
}

export const getKnowledgeCategories = () =>
	cached("knowledge-categories", fetchCategories);

async function fetchSections(): Promise<KnowledgeSection[]> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "knowledge-sections",
		where: { isActive: { equals: true } },
		sort: ["order", "title"],
		limit: 500,
		pagination: false,
		depth: 0,
	});
	return result.docs as KnowledgeSection[];
}

export const getKnowledgeSections = () =>
	cached("knowledge-sections", fetchSections);

/**
 * Раздел по адресу. Возвращает и то, попали ли мы по актуальному slug: если по
 * прежнему — страница обязана уйти 301-редиректом, а не отдать контент по двум
 * адресам сразу (дубль в индексе).
 */
async function fetchCategoryBySlug(slug: string) {
	const categories = await getKnowledgeCategories();

	const exact = categories.find((category) => category.slug === slug);
	if (exact) return { category: exact, canonical: true as const };

	const byPrevious = categories.find((category) =>
		category.previousSlugs?.some((entry) => entry.slug === slug),
	);
	if (byPrevious) return { category: byPrevious, canonical: false as const };

	return null;
}

export const getKnowledgeCategoryBySlug = (slug: string) =>
	fetchCategoryBySlug(slug);

// ── Обзорное дерево /knowledge ──────────────────────────────────────────────

async function fetchOverview(): Promise<KnowledgeOverview> {
	const payload = await getPayloadInstance();
	const [categories, sections] = await Promise.all([
		getKnowledgeCategories(),
		getKnowledgeSections(),
	]);

	// Один запрос за всеми материалами вместо запроса на каждый раздел: N+1 на
	// странице, где разделов десятки, — это десятки round-trip'ов к БД ради
	// данных, которые всё равно группируются в памяти.
	const result = await payload.find({
		collection: "knowledge-topics",
		where: PUBLISHED,
		sort: ["position", "title"],
		limit: OVERVIEW_TOPIC_LIMIT,
		depth: 1,
		select: SUMMARY_SELECT,
	});

	const categoryMap = new Map(categories.map((c) => [c.id, c]));
	const summaries = (
		result.docs as Array<Partial<KnowledgeTopic> & { id: number }>
	)
		.map((doc) => toSummary(doc, categoryMap))
		// Материал в отключённом разделе на сайте не показываем: раздела нет —
		// нет и адреса, по которому статья могла бы открыться.
		.filter(
			(topic) => topic.categoryId !== null && categoryMap.has(topic.categoryId),
		);

	const byCategory = new Map<number, KnowledgeTopicSummary[]>();
	for (const topic of summaries) {
		const list = byCategory.get(topic.categoryId as number);
		if (list) list.push(topic);
		else byCategory.set(topic.categoryId as number, [topic]);
	}

	const sectionsByCategory = new Map<number, KnowledgeSection[]>();
	for (const section of sections) {
		const categoryId = relationId(section.category);
		if (categoryId === null) continue;
		const list = sectionsByCategory.get(categoryId);
		if (list) list.push(section);
		else sectionsByCategory.set(categoryId, [section]);
	}

	const tree: KnowledgeCategoryTree[] = categories
		.map((category) => {
			const topics = byCategory.get(category.id) ?? [];
			if (topics.length === 0) return null;

			const groups: KnowledgeGroup[] = [];

			// Статьи без секции идут первыми: это «общие» материалы раздела, и
			// прятать их под секциями было бы неверно.
			const looseTopics = topics
				.filter((t) => t.sectionId === null)
				.sort(byPosition);
			if (looseTopics.length > 0) {
				groups.push({ section: null, topics: looseTopics });
			}

			for (const section of sectionsByCategory.get(category.id) ?? []) {
				const sectionTopics = topics
					.filter((t) => t.sectionId === section.id)
					.sort(byPosition);
				// Пустые секции читателю показывать нечего.
				if (sectionTopics.length > 0) {
					groups.push({ section, topics: sectionTopics });
				}
			}

			return { category, groups, total: topics.length };
		})
		.filter((entry): entry is KnowledgeCategoryTree => entry !== null);

	return {
		tree,
		featured: summaries.filter((topic) => topic.featured).sort(byPosition),
		totalTopics: result.totalDocs,
		truncated: result.totalDocs > OVERVIEW_TOPIC_LIMIT,
	};
}

export const getKnowledgeOverview = () =>
	cached("knowledge-overview", fetchOverview);

// ── Поиск и фильтрация ──────────────────────────────────────────────────────

export interface SearchKnowledgeArgs {
	q?: string;
	categorySlug?: string | null;
	sectionSlug?: string | null;
	page?: number;
}

const EMPTY_RESULT: KnowledgeSearchResult = {
	hits: [],
	total: 0,
	page: 1,
	totalPages: 0,
};

/**
 * Поиск и фильтрация материалов.
 *
 * Поиск — полнотекстовый, средствами самого Postgres: конфигурация 'russian'
 * (snowball, входит в стандартную поставку, расширений не требует) приводит
 * слова к основам, поэтому «сети» находит «сеть», а «сушка» — «сушите». Через
 * `where` Payload это невыразимо, поэтому запрос за идентификаторами идёт
 * напрямую в drizzle, а сами документы забираются уже штатным find по списку
 * id — то есть все хуки, доступы и populate остаются на месте.
 *
 * Почему не подстрочный `like`, которым обходится поиск по товарам: там
 * ищут по короткому названию и артикулу, а здесь — по тексту руководства.
 * Человек набирает слово в том падеже, в котором думает, а в статье оно
 * стоит в другом; на подстроках такой поиск молчит, и им перестают
 * пользоваться.
 *
 * Ранжирование тоже в SQL (ts_rank + бонус за совпадение в заголовке): только
 * так порядок остаётся правильным при постраничной выдаче — ранжировать
 * страницу в памяти значит ранжировать случайную выборку.
 */
async function fetchSearch({
	q = "",
	categorySlug = null,
	sectionSlug = null,
	page = 1,
}: SearchKnowledgeArgs): Promise<KnowledgeSearchResult> {
	const payload = await getPayloadInstance();
	const [categories, sections] = await Promise.all([
		getKnowledgeCategories(),
		getKnowledgeSections(),
	]);

	const category = categorySlug
		? categories.find((entry) => entry.slug === categorySlug)
		: undefined;
	const section = sectionSlug
		? sections.find((entry) => entry.slug === sectionSlug)
		: undefined;

	// Фильтр указывает на несуществующий (или отключённый) раздел/секцию —
	// это пустая выдача, а не «показать всё»: иначе подделанный параметр в URL
	// молча показывал бы не то, что написано в интерфейсе.
	if ((categorySlug && !category) || (sectionSlug && !section)) {
		return EMPTY_RESULT;
	}

	const tsQuery = buildTsQuery(q);

	const { ids, total } = tsQuery
		? await findRankedIds({
				payload,
				tsQuery,
				categoryId: category?.id ?? null,
				sectionId: section?.id ?? null,
				page,
			})
		: await findFilteredIds({
				payload,
				categoryId: category?.id ?? null,
				sectionId: section?.id ?? null,
				page,
			});

	if (ids.length === 0) return { ...EMPTY_RESULT, page: 1 };

	const result = await payload.find({
		collection: "knowledge-topics",
		where: { and: [PUBLISHED, { id: { in: ids } }] },
		limit: ids.length,
		depth: 1,
		select: SEARCH_SELECT,
	});

	const categoryMap = new Map(categories.map((c) => [c.id, c]));
	const docs = result.docs as Array<Partial<KnowledgeTopic> & { id: number }>;
	const byId = new Map(docs.map((doc) => [doc.id, doc]));

	// Порядок задан ранжированием в SQL, а find возвращает документы в своём —
	// восстанавливаем его по списку id.
	const stems = toHighlightStems(q);
	const hits = ids
		.map((id) => byId.get(id))
		.filter((doc): doc is Partial<KnowledgeTopic> & { id: number } =>
			Boolean(doc),
		)
		.map((doc) => ({
			...toSummary(doc, categoryMap),
			snippet: tsQuery
				? buildSnippet(doc.searchText ?? doc.description ?? null, stems)
				: (doc.description ?? null),
		}))
		.filter(
			(hit) => hit.categoryId !== null && categoryMap.has(hit.categoryId),
		);

	const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));

	return {
		hits,
		total,
		page: Math.min(Math.max(1, page), totalPages),
		totalPages: total === 0 ? 0 : totalPages,
	};
}

type PayloadInstance = Awaited<ReturnType<typeof getPayloadInstance>>;

interface RankedIdsArgs {
	payload: PayloadInstance;
	tsQuery: string;
	categoryId: number | null;
	sectionId: number | null;
	page: number;
}

/**
 * Идентификаторы материалов, отсортированные по релевантности.
 *
 * `count(*) OVER ()` вместо отдельного COUNT-запроса: общее число совпадений
 * нужно для пагинации, и брать его вторым походом в БД незачем.
 */
async function findRankedIds({
	payload,
	tsQuery,
	categoryId,
	sectionId,
	page,
}: RankedIdsArgs): Promise<{ ids: number[]; total: number }> {
	const offset = (Math.max(1, page) - 1) * SEARCH_PAGE_SIZE;

	// Значения уходят параметрами; в tsQuery к этому моменту остались только
	// буквы, цифры и служебные `:*`/`&`, собранные нами (см. buildTsQuery).
	const rows = await payload.db.drizzle.execute(sql`
		WITH q AS (SELECT to_tsquery('russian', ${tsQuery}) AS query)
		SELECT
			kt."id" AS id,
			count(*) OVER () AS total
		FROM "knowledge_topics" kt, q
		WHERE kt."_status" = 'published'
			AND to_tsvector('russian', coalesce(kt."search_text", '')) @@ q.query
			AND (${categoryId}::int IS NULL OR kt."category_id" = ${categoryId}::int)
			AND (${sectionId}::int IS NULL OR kt."section_id" = ${sectionId}::int)
		ORDER BY
			(
				ts_rank(to_tsvector('russian', coalesce(kt."search_text", '')), q.query)
				-- Совпадение в заголовке весит больше любого совпадения в теле:
				-- статья ровно с таким названием обязана быть первой, а не
				-- соревноваться с материалом, где слово мелькнуло в примечании.
				+ CASE WHEN to_tsvector('russian', coalesce(kt."title", '')) @@ q.query
					THEN 1 ELSE 0 END
			) DESC,
			kt."featured" DESC NULLS LAST,
			kt."position" ASC NULLS LAST,
			kt."title" ASC
		LIMIT ${SEARCH_PAGE_SIZE}
		OFFSET ${offset};
	`);

	return normalizeIdRows(rows);
}

/**
 * Тот же список, но без поискового запроса — только фильтры. Здесь всё
 * выражается штатным find, поэтому в SQL спускаться незачем.
 */
async function findFilteredIds({
	payload,
	categoryId,
	sectionId,
	page,
}: {
	payload: PayloadInstance;
	categoryId: number | null;
	sectionId: number | null;
	page: number;
}): Promise<{ ids: number[]; total: number }> {
	const conditions: Where[] = [PUBLISHED];
	if (categoryId !== null)
		conditions.push({ category: { equals: categoryId } });
	if (sectionId !== null) conditions.push({ section: { equals: sectionId } });

	const result = await payload.find({
		collection: "knowledge-topics",
		where: { and: conditions },
		sort: ["position", "title"],
		limit: SEARCH_PAGE_SIZE,
		page: Math.max(1, page),
		depth: 0,
		select: {},
	});

	return {
		ids: result.docs.map((doc) => doc.id as number),
		total: result.totalDocs,
	};
}

/**
 * Драйверы Postgres возвращают результат по-разному (массив строк или объект
 * с полем rows), а count(*) OVER () приходит строкой — bigint не помещается
 * в number, и node-postgres не рискует его приводить.
 */
function normalizeIdRows(raw: unknown): { ids: number[]; total: number } {
	const rows = (
		Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] })?.rows ?? [])
	) as Array<{ id: number | string; total: number | string }>;

	if (rows.length === 0) return { ids: [], total: 0 };

	return {
		ids: rows.map((row) => Number(row.id)),
		total: Number(rows[0].total),
	};
}

/**
 * Поисковые запросы намеренно НЕ кэшируются в Data Cache Next.
 *
 * Ключ кэша включал бы произвольную строку из URL — то есть любой обход
 * ботом с ?q=<случайный мусор> раздувал бы кэш на диске неограниченно. Сам
 * запрос — это один SELECT по GIN-индексу; на масштабе базы знаний он дешевле,
 * чем обслуживание такого кэша.
 */
export const searchKnowledgeTopics = (args: SearchKnowledgeArgs) =>
	fetchSearch(args);

// ── Отдельная статья ────────────────────────────────────────────────────────

async function fetchTopicBySlug(
	slug: string,
): Promise<KnowledgeArticle | null> {
	const payload = await getPayloadInstance();

	const result = await payload.find({
		collection: "knowledge-topics",
		where: { and: [PUBLISHED, { slug: { equals: slug } }] },
		limit: 1,
		// depth 2: сама статья → раздел/секция/медиа (1) → медиа внутри
		// рекомендованных статей и upload-узлов rich text (2).
		depth: 2,
	});

	const topic = result.docs[0] as KnowledgeTopic | undefined;
	if (!topic) return null;

	const category =
		typeof topic.category === "object"
			? (topic.category as KnowledgeCategory)
			: null;
	// Раздел отключили — материал по своему адресу больше не существует.
	if (!category || category.isActive === false) return null;

	const section =
		topic.section && typeof topic.section === "object"
			? (topic.section as KnowledgeSection)
			: null;

	return {
		topic,
		category,
		section: section?.isActive === false ? null : section,
	};
}

export const getKnowledgeTopicBySlug = (slug: string) =>
	cached(`knowledge-topic-${slug}`, () => fetchTopicBySlug(slug));

/**
 * Поиск статьи по прежнему адресу — для 301 со старого URL.
 * Отдельный запрос, а не часть основного: он нужен только когда основной уже
 * ничего не нашёл, и платить за него на каждом открытии статьи незачем.
 */
async function fetchTopicByPreviousSlug(
	slug: string,
): Promise<KnowledgeTopic | null> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "knowledge-topics",
		where: { and: [PUBLISHED, { "previousSlugs.slug": { equals: slug } }] },
		limit: 1,
		depth: 1,
		select: { slug: true, category: true },
	});
	return (result.docs[0] as KnowledgeTopic | undefined) ?? null;
}

export const getKnowledgeTopicByPreviousSlug = (slug: string) =>
	cached(`knowledge-topic-prev-${slug}`, () => fetchTopicByPreviousSlug(slug));

/**
 * Рекомендованные материалы.
 *
 * Автоматического подбора здесь нет по прямому требованию: список задаёт
 * редактор, и его порядок сохраняется. Наша задача — отфильтровать то, что
 * показывать нельзя: саму статью, снятые с публикации и попавшие в
 * отключённый раздел.
 */
export function resolveRelatedTopics(
	article: KnowledgeArticle,
	categories: KnowledgeCategory[],
): KnowledgeTopicSummary[] {
	const related = article.topic.related;
	if (!Array.isArray(related) || related.length === 0) return [];

	const categoryMap = new Map(categories.map((c) => [c.id, c]));

	return related
		.filter(
			(entry): entry is KnowledgeTopic =>
				typeof entry === "object" && entry !== null,
		)
		.filter((entry) => entry.id !== article.topic.id)
		.filter((entry) => (entry as { _status?: string })._status === "published")
		.map((entry) => toSummary(entry, categoryMap))
		.filter(
			(summary) =>
				summary.categoryId !== null && categoryMap.has(summary.categoryId),
		);
}

// ── Sitemap ─────────────────────────────────────────────────────────────────

export interface KnowledgeSitemapEntry {
	path: string;
	updatedAt: string;
}

async function fetchSitemapEntries(): Promise<KnowledgeSitemapEntry[]> {
	const payload = await getPayloadInstance();
	const categories = await getKnowledgeCategories();
	const categoryMap = new Map(categories.map((c) => [c.id, c]));

	const result = await payload.find({
		collection: "knowledge-topics",
		where: PUBLISHED,
		limit: 5000,
		pagination: false,
		depth: 0,
		select: { slug: true, category: true, updatedAt: true },
	});

	const topics = (
		result.docs as Array<Partial<KnowledgeTopic> & { id: number }>
	).flatMap((doc) => {
		const categoryId = relationId(doc.category);
		const category =
			categoryId !== null ? categoryMap.get(categoryId) : undefined;
		if (!category || !doc.slug) return [];
		return [
			{
				path: `/knowledge/${category.slug}/${doc.slug}`,
				updatedAt: doc.updatedAt ?? new Date().toISOString(),
			},
		];
	});

	return [
		...categories.map((category) => ({
			path: `/knowledge/${category.slug}`,
			updatedAt: category.updatedAt,
		})),
		...topics,
	];
}

export const getKnowledgeSitemapEntries = () =>
	cached("knowledge-sitemap", fetchSitemapEntries);
