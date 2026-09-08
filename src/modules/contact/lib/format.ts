/**
 * Мелкие преобразования данных из Payload к тому виду, в котором их показывает
 * страница. Чистые функции без React — их можно вызывать и на сервере, и в
 * клиентских компонентах.
 */

/**
 * Ссылка для звонка. Из номера убирается всё, кроме цифр и ведущего плюса:
 * пробелы и скобки в `tel:` часть мобильных браузеров и десктопных
 * приложений трактует непредсказуемо, а «+» значим — без него номер уйдёт
 * как местный.
 */
export function telHref(value: string): string {
	const trimmed = value.trim();
	const digits = trimmed.replace(/[^\d]/g, "");
	return trimmed.startsWith("+") ? `tel:+${digits}` : `tel:${digits}`;
}

/**
 * Сортировка элементов массивов Payload по полю sortOrder.
 *
 * Записи без значения уходят в конец, а не считаются нулём: администратор,
 * проставивший порядок половине списка, ожидает, что нетронутые строки
 * останутся под ними, а не всплывут наверх.
 */
export function bySortOrder<T extends { sortOrder?: number | null }>(
	items: readonly T[] | null | undefined,
): T[] {
	if (!items?.length) return [];
	return [...items].sort((a, b) => {
		const left = a.sortOrder ?? Number.POSITIVE_INFINITY;
		const right = b.sortOrder ?? Number.POSITIVE_INFINITY;
		return left - right;
	});
}

/**
 * Главный элемент списка: помеченный isPrimary, иначе первый.
 * Возвращает undefined на пустом списке — вызывающий обязан это учесть.
 */
export function primaryOf<T extends { isPrimary?: boolean | null }>(
	items: readonly T[],
): T | undefined {
	return items.find((item) => item.isPrimary) ?? items[0];
}
