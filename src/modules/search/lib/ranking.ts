import {
	normalizeForSearch,
	parseQueryTerms,
} from "../../knowledge/lib/search.ts";
import type { SearchResultType } from "../types.ts";

/**
 * Релевантность результатов поиска в шапке — одна мера на все типы.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ОБЩАЯ МЕРА
 * ────────────────────────────────────────────────────────────────────────────
 * Выдача смешанная: товары, статьи базы знаний, вопросы FAQ. Каждый источник
 * находит кандидатов своим способом (товары и статьи — полнотекстовым поиском
 * Postgres, FAQ — перебором кэшированного списка), но СРАВНИВАТЬ их между
 * собой можно только одной линейкой. Иначе порядок секций решался бы тем,
 * чей ts_rank случайно оказался больше, а ts_rank разных корпусов между
 * собой несопоставим.
 *
 * Поэтому источники отвечают на вопрос «подходит ли», а эта функция — «НАСКОЛЬКО
 * подходит», по одним и тем же правилам для всех:
 *
 *   1.00  заголовок совпал с запросом целиком;
 *   0.92  заголовок начинается с запроса («вул» → «Вултур P10v2»);
 *   0.82  запрос стоит в заголовке целой фразой;
 *   0.72  все слова запроса есть в заголовке (в любой форме и порядке);
 *   ≤0.60 в заголовке часть слов;
 *   0.50  совпала характеристика товара («IP67», «220 В»);
 *   0.40  совпало описание товара;
 *   0.35  совпал текст статьи или ответ на вопрос;
 *   ≤0.25 похожее по написанию название (опечатка, pg_trgm).
 *
 * Итог умножается на вес типа. Товар — главное, ради чего приходят в
 * магазин, поэтому при равном совпадении он выше; но вес не настолько
 * велик, чтобы товар, где слово мелькнуло в описании (0.40), обошёл вопрос
 * FAQ, заголовок которого совпал с запросом дословно (1.00 × 0.80).
 */

export const TYPE_WEIGHT: Record<SearchResultType, number> = {
	product: 1,
	knowledge: 0.85,
	faq: 0.8,
};

/** Порядок типов при равной релевантности. */
const TYPE_PRIORITY: SearchResultType[] = ["product", "knowledge", "faq"];

/** Где нашлось совпадение, если не в заголовке. */
export type SecondaryMatch = "spec" | "description" | "body";

const SECONDARY_SCORE: Record<SecondaryMatch, number> = {
	spec: 0.5,
	description: 0.4,
	body: 0.35,
};

/**
 * Товар, которого нет в наличии, чуть ниже такого же, который есть: искать
 * его имеет смысл (можно заказать позже, посмотреть характеристики), но
 * при прочих равных человеку полезнее то, что можно купить сейчас.
 */
const UNAVAILABLE_FACTOR = 0.95;

/**
 * Грубая основа слова: без двух последних букв у длинных слов. Полноценный
 * стемминг делает Postgres при отборе кандидатов; здесь нужно только
 * понять, стоит ли слово запроса в заголовке в другой форме — «сеткомёты»
 * и «сеткомёта» должны считаться совпадением.
 */
function stemOf(term: string): string {
	return term.length >= 5 ? term.slice(0, term.length - 2) : term;
}

function wordsOf(text: string): string[] {
	return normalizeForSearch(text).split(" ").filter(Boolean);
}

/** Сколько слов запроса встречается в тексте (с точностью до окончания). */
export function countMatchedTerms(terms: string[], text: string): number {
	const words = wordsOf(text);
	return terms.filter((term) => {
		const stem = stemOf(term);
		return words.some((word) => word.startsWith(stem));
	}).length;
}

/** Все ли слова запроса встречаются в тексте. */
export function matchesAllTerms(query: string, text: string): boolean {
	const terms = parseQueryTerms(query);
	return terms.length > 0 && countMatchedTerms(terms, text) === terms.length;
}

/** Насколько заголовок отвечает запросу, 0…1 (шкала — в описании модуля). */
export function titleMatchScore(query: string, title: string): number {
	const q = normalizeForSearch(query);
	const t = normalizeForSearch(title);
	if (!q || !t) return 0;

	if (t === q) return 1;
	if (t.startsWith(q)) return 0.92;
	if (` ${t}`.includes(` ${q}`)) return 0.82;

	const terms = parseQueryTerms(query);
	if (terms.length === 0) return 0;

	const matched = countMatchedTerms(terms, title);
	if (matched === terms.length) return 0.72;
	if (matched > 0) return 0.25 + (0.35 * matched) / terms.length;
	return 0;
}

export interface ScoreInput {
	type: SearchResultType;
	query: string;
	title: string;
	/** Совпадение вне заголовка, если оно было. */
	secondary?: SecondaryMatch | null;
	/** Можно ли заказать товар прямо сейчас. Для статей и FAQ не задаётся. */
	available?: boolean;
	/**
	 * Результат нечёткого поиска (опечатка): сходство 0…1. Такое совпадение
	 * всегда ниже любого точного.
	 */
	similarity?: number;
}

export function scoreResult({
	type,
	query,
	title,
	secondary = null,
	available = true,
	similarity,
}: ScoreInput): number {
	const base =
		similarity !== undefined
			? // Потолок 0.25 — ниже самого слабого точного совпадения
				// (ответ FAQ: 0.35 × 0.80 = 0.28): догадка по написанию не
				// должна обходить то, что действительно содержит запрос.
				Math.min(similarity, 1) * 0.25
			: Math.max(
					titleMatchScore(query, title),
					secondary ? SECONDARY_SCORE[secondary] : 0,
				);

	return base * TYPE_WEIGHT[type] * (available ? 1 : UNAVAILABLE_FACTOR);
}

/**
 * Устойчивая сортировка по убыванию оценки: при равной оценке сохраняется
 * исходный порядок, то есть порядок источника (ts_rank, популярность товара,
 * позиция статьи в разделе).
 */
export function sortByScore<T>(items: T[], scoreOf: (item: T) => number): T[] {
	return items
		.map((item, index) => ({ item, index, score: scoreOf(item) }))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((entry) => entry.item);
}

/**
 * Порядок секций: по лучшему результату в каждой, при равенстве — товары,
 * затем статьи, затем FAQ. Пустые секции отбрасываются.
 */
export function orderSections<S extends { type: SearchResultType }>(
	sections: Array<{ section: S; topScore: number; size: number }>,
): S[] {
	return sections
		.filter((entry) => entry.size > 0)
		.sort(
			(a, b) =>
				b.topScore - a.topScore ||
				TYPE_PRIORITY.indexOf(a.section.type) -
					TYPE_PRIORITY.indexOf(b.section.type),
		)
		.map((entry) => entry.section);
}
