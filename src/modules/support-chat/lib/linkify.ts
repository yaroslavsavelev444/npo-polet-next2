/**
 * Разбивка текста сообщения на фрагменты «текст» и «ссылка» — для консоли и
 * виджета. Сообщение показывается ТОЛЬКО как текст: никакой разметки от
 * пользователя, ссылками становятся лишь адреса http(s) — `javascript:`,
 * `data:` и прочие схемы остаются обычным текстом.
 *
 * Хвостовая пунктуация («…см. https://site.ru/a.») в ссылку не входит.
 */

export type TextPart =
	| { type: "text"; value: string }
	| { type: "link"; value: string; href: string };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'«»]+/gi;
const TRAILING = /[.,;:!?)\]}»]+$/;

export function linkify(text: string): TextPart[] {
	const parts: TextPart[] = [];
	let last = 0;
	for (const match of text.matchAll(URL_PATTERN)) {
		const start = match.index ?? 0;
		let url = match[0];
		const trailing = url.match(TRAILING)?.[0] ?? "";
		if (trailing) url = url.slice(0, -trailing.length);

		let href: string | null = null;
		try {
			const parsed = new URL(url);
			if (parsed.protocol === "http:" || parsed.protocol === "https:")
				href = parsed.href;
		} catch {
			href = null;
		}

		if (start > last)
			parts.push({ type: "text", value: text.slice(last, start) });
		parts.push(
			href ? { type: "link", value: url, href } : { type: "text", value: url },
		);
		last = start + url.length;
	}
	if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
	return parts;
}
