// src/modules/feed/lib/sanitize.ts
//
// Подготовка «сырых» полей товара к вставке в фид.

import { baseURL } from "@/resources/content";

/**
 * Приводит описание товара к чистому тексту.
 *
 * В текущей модели Payload `description` — это `textarea` (обычный текст), но
 * данные могли приехать из старой БД с остатками HTML, поэтому обрабатываем
 * defensively: вырезаем script/style вместе с содержимым, превращаем <br> и
 * блочные теги в переводы строк, снимаем остальные теги, декодируем базовые
 * HTML-сущности и схлопываем лишние пробелы. Экранированием спецсимволов и
 * защитой CDATA занимается уже слой xml.ts (cdata()).
 */
export function sanitizeDescription(input: string): string {
	if (!input) return "";

	let text = input
		// script/style — вместе с содержимым
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
		// переводы строк из <br> и закрытия блочных тегов
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
		// все прочие теги
		.replace(/<[^>]+>/g, "");

	// Базовые HTML-сущности
	text = text
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'");

	// Нормализация пробелов: не больше одной пустой строки подряд
	text = text
		.replace(/[ \t]+/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]*\n[ \t]*/g, "\n")
		.trim();

	return text;
}

/**
 * Гарантирует абсолютный URL для картинок. Payload при заданном serverURL
 * обычно уже отдаёт абсолютный `url`, но полагаться на это в фиде нельзя:
 * Яндекс требует именно абсолютные ссылки на изображения. Если url уже
 * абсолютный — возвращаем как есть, иначе приклеиваем baseURL.
 */
export function ensureAbsoluteUrl(
	url: string | null | undefined,
): string | null {
	if (!url) return null;
	if (/^https?:\/\//i.test(url)) return url;
	return `${baseURL}${url.startsWith("/") ? url : `/${url}`}`;
}
