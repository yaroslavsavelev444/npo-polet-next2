/**
 * Разбор значения настройки «Код карты» (глобал settings, поле `map`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ БЕЛЫЙ СПИСОК, А НЕ ПРОСТО ВСТАВКА
 * ────────────────────────────────────────────────────────────────────────────
 * Поле в админке принимает произвольный текст: и готовый `<iframe …>`, и
 * просто ссылку. Вставлять его содержимое в разметку как HTML нельзя — это
 * означало бы, что любой, у кого есть доступ к настройкам, может встроить в
 * страницу произвольный документ: фишинговую форму, прозрачный оверлей поверх
 * интерфейса, что угодно.
 *
 * Поэтому здесь ровно та же схема, что уже действует для видео в базе знаний
 * (modules/knowledge/lib/videoEmbed): из значения извлекается адрес, адрес
 * проверяется по белому списку хостов, а <iframe> страница рисует свой, с
 * нужными атрибутами.
 *
 * ВАЖНО: хосты из ALLOWED_MAP_FRAME_SRC обязаны быть перечислены в директиве
 * frame-src в proxy.ts — иначе строгий CSP молча заблокирует фрейм, и на
 * странице останется пустая рамка без единого сообщения об ошибке.
 */

/** Картографические сервисы, чьи виджеты разрешено встраивать. */
export const ALLOWED_MAP_FRAME_SRC = [
	"https://yandex.ru",
	"https://yandex.com",
	"https://widgets.2gis.com",
	"https://www.google.com",
] as const;

const ALLOWED_MAP_HOSTS = new Set(
	ALLOWED_MAP_FRAME_SRC.map((origin) => new URL(origin).hostname),
);

/**
 * Возвращает готовый src для <iframe> или null, если значение пустое,
 * не разбирается или ведёт на неразрешённый хост.
 */
export function parseMapEmbed(raw?: string | null): string | null {
	if (!raw) return null;

	const value = raw.trim();
	if (!value) return null;

	// Из полного кода вставки берём только src; если пришла голая ссылка —
	// используем её как есть.
	const fromIframe = value.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
	const candidate = fromIframe ? fromIframe[1] : value;

	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return null;
	}

	// Схему проверяем явно: `javascript:` в src сработал бы при загрузке фрейма.
	if (url.protocol !== "https:") return null;
	if (!ALLOWED_MAP_HOSTS.has(url.hostname)) return null;

	return url.toString();
}
