/**
 * Когда запрос к подсказкам организаций имеет смысл отправлять.
 *
 * Общий для формы и роута: клиент по нему не шлёт лишнее, сервер — не
 * пропускает к DaData то, что клиент мог прислать в обход формы. Квота у
 * подсказок общая на аккаунт, и основная экономия — именно здесь.
 *
 *  • текст — от 3 символов, как у адресов: по одной-двум буквам список —
 *    случайные организации;
 *  • цифры — только от 10 (полный ИНН юрлица). Набор ИНН по цифре дал бы
 *    восемь запросов с тысячами совпадающих префиксов, и ни один из них
 *    пользователю не нужен.
 */

export const COMPANY_QUERY_MIN_TEXT = 3;
export const COMPANY_QUERY_MIN_DIGITS = 10;
/** DaData режет запрос по 300 символам. */
const MAX_LENGTH = 300;

/** Схлопывает пробелы: «7707 083 893» и «7707083893» — один и тот же ИНН. */
export function normalizeCompanyQuery(raw: string): string {
	const collapsed = raw.trim().replace(/\s+/g, " ").slice(0, MAX_LENGTH);
	return /^[\d ]+$/.test(collapsed) ? collapsed.replace(/ /g, "") : collapsed;
}

export function isDigitsQuery(query: string): boolean {
	return /^\d+$/.test(query);
}

/** Принимает уже нормализованный запрос. */
export function isCompanyQuerySearchable(query: string): boolean {
	return isDigitsQuery(query)
		? query.length >= COMPANY_QUERY_MIN_DIGITS
		: query.length >= COMPANY_QUERY_MIN_TEXT;
}
