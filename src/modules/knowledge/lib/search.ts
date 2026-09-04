import {
	SEARCH_BODY_SEPARATOR,
	SEARCH_MAX_TERMS,
	SEARCH_MIN_TERM_LENGTH,
	SNIPPET_LENGTH,
} from "./constants";

/**
 * Разбор пользовательского запроса на термы.
 *
 * Ё приводится к Е: в технических текстах его пишут через раз, и запрос
 * «сеткомет» обязан находить «сеткомёт». Пунктуация выбрасывается — иначе
 * «сеткомёт,» не совпадёт ни с чем.
 */
export function parseQueryTerms(query: string): string[] {
	return normalizeForSearch(query)
		.split(" ")
		.filter((term) => term.length >= SEARCH_MIN_TERM_LENGTH)
		.slice(0, SEARCH_MAX_TERMS);
}

export function normalizeForSearch(value: string): string {
	return value
		.toLowerCase()
		.replace(/ё/g, "е")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

/**
 * Термы для подсветки и поиска фрагмента в тексте.
 *
 * Совпадение ищет Postgres со стеммингом («сети» находит «сеть»), поэтому
 * подсвечивать точное слово из запроса бессмысленно: найденная статья содержит
 * другую словоформу, и подсветка просто не сработает. Обрезаем окончание —
 * получается грубая, но работающая основа слова: «сети» → «сет» подсветит и
 * «сеть», и «сетка», и «сеткомёт».
 *
 * Три символа — нижняя граница: короче основа начинает совпадать со всем
 * подряд, и подсветка превращается в шум. Слова из трёх букв и короче
 * оставляем как есть — обрезать там уже нечего.
 */
export function toHighlightStems(query: string): string[] {
	return parseQueryTerms(query).map((term) =>
		term.length >= 4 ? term.slice(0, Math.max(3, term.length - 2)) : term,
	);
}

/**
 * Запрос для to_tsquery.
 *
 * Каждое слово получает префиксный шаблон `:*` — иначе поиск молчал бы, пока
 * пользователь не допечатает слово целиком: полнотекстовый индекс оперирует
 * законченными лексемами, а не подстроками. Слова соединяются `&`: находим
 * материалы, где встречаются ВСЕ слова запроса, а не любое из них.
 *
 * Значение уходит в SQL параметром, а сами термы уже очищены до букв и цифр
 * (normalizeForSearch) — символы синтаксиса tsquery (`&`, `|`, `!`, `:`, `(`)
 * в них попасть не могут.
 */
export function buildTsQuery(query: string): string | null {
	const terms = parseQueryTerms(query);
	if (terms.length === 0) return null;
	return terms.map((term) => `${term}:*`).join(" & ");
}

/**
 * Фрагмент ТЕКСТА статьи вокруг первого совпадения — чтобы в выдаче было
 * видно, ПОЧЕМУ статья найдена, а не только что она найдена.
 *
 * Из поискового индекса берётся только часть после разделителя: до него лежат
 * заголовок, описание и теги, и показывать их фрагментом бессмысленно — они
 * напечатаны прямо над этой строкой. Если совпадение нашлось только в шапке,
 * возвращаем null: строка выдачи в этом случае покажет обычное описание, и оно
 * уже будет с подсветкой.
 *
 * Возвращает обычную строку: подсветка делается разбиением на React-узлы при
 * рендере (см. HighlightedText), а не вставкой HTML — никакого
 * dangerouslySetInnerHTML на пользовательском вводе.
 */
export function buildSnippet(
	source: string | null | undefined,
	terms: string[],
): string | null {
	if (!source) return null;

	const separatorAt = source.indexOf(SEARCH_BODY_SEPARATOR);
	const body =
		separatorAt >= 0
			? source.slice(separatorAt + SEARCH_BODY_SEPARATOR.length).trim()
			: source;

	if (!body) return null;

	return windowAround(body, terms);
}

function windowAround(source: string, terms: string[]): string | null {
	const haystack = normalizeForSearch(source);
	const firstHit = terms
		.map((term) => haystack.indexOf(term))
		.filter((index) => index >= 0)
		.sort((a, b) => a - b)[0];

	if (firstHit === undefined) {
		// Совпадений в теле нет — значит, нашлось в заголовке или описании, и
		// фрагмент не нужен.
		return null;
	}

	// Нормализация схлопывает пунктуацию, поэтому индекс в нормализованной
	// строке лишь приблизительно совпадает с исходной. Для фрагмента этого
	// достаточно: отступаем назад до границы слова и берём окно фиксированной
	// длины.
	const start = Math.max(0, firstHit - Math.floor(SNIPPET_LENGTH / 3));
	const wordStart = start === 0 ? 0 : source.indexOf(" ", start) + 1;
	const slice = source.slice(wordStart, wordStart + SNIPPET_LENGTH);

	const prefix = wordStart > 0 ? "…" : "";
	const suffix = wordStart + SNIPPET_LENGTH < source.length ? "…" : "";

	return `${prefix}${slice.trim()}${suffix}`;
}

/**
 * Делит строку на куски, помечая совпавшие с термами. Используется для
 * подсветки в выдаче.
 */
export function splitByTerms(
	text: string,
	terms: string[],
): Array<{ text: string; match: boolean }> {
	if (terms.length === 0 || !text) return [{ text, match: false }];

	const normalized = normalizeForSearch(text);
	const flags = new Array<boolean>(text.length).fill(false);

	// Нормализация меняет длину строки, поэтому позиции считаем по карте
	// соответствия символов: каждому символу исходной строки сопоставлен его
	// индекс в нормализованной.
	const map: number[] = [];
	{
		let normalizedIndex = 0;
		let lastWasSeparator = true;
		for (const char of text) {
			const isWordChar = /[\p{L}\p{N}]/u.test(char);
			if (isWordChar) {
				map.push(normalizedIndex);
				normalizedIndex += 1;
				lastWasSeparator = false;
			} else {
				map.push(-1);
				if (!lastWasSeparator) normalizedIndex += 1;
				lastWasSeparator = true;
			}
		}
	}

	for (const term of terms) {
		let from = 0;
		for (;;) {
			const found = normalized.indexOf(term, from);
			if (found === -1) break;
			for (let i = 0; i < text.length; i++) {
				const pos = map[i];
				if (pos >= found && pos < found + term.length) flags[i] = true;
			}
			from = found + term.length;
		}
	}

	const parts: Array<{ text: string; match: boolean }> = [];
	let buffer = "";
	let current = flags[0] ?? false;

	for (let i = 0; i < text.length; i++) {
		if (flags[i] === current) {
			buffer += text[i];
		} else {
			parts.push({ text: buffer, match: current });
			buffer = text[i];
			current = flags[i];
		}
	}
	if (buffer) parts.push({ text: buffer, match: current });

	return parts;
}
