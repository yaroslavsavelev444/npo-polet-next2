import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Consents.module.css";

/**
 * Строка документа с живыми ссылками.
 *
 * В текстах соглашений адреса, почта и телефон записаны как есть:
 * «https://npo-polet.ru/consents/offer», «npo-polet@yandex.ru», «+7 929 064
 * 80 09». На странице они должны работать — выделять и копировать адрес
 * почты из юридического текста никто не обязан.
 *
 * Ссылки на сам сайт становятся внутренними: оферта, на которую ссылается
 * пользовательское соглашение, открывается здесь же, а не перезагрузкой
 * всего сайта по абсолютному адресу.
 */

const TOKEN =
	/(https?:\/\/[^\s«»"<>]+|(?:www\.)?npo-polet\.ru\/[^\s«»"<>]*|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\+7[\s(]*\d{3}[\s)]*\d{3}[\s-]?\d{2}[\s-]?\d{2})/gi;
const OWN_HOST = /^(?:https?:\/\/)?(?:www\.)?npo-polet\.ru(\/[^\s]*)?$/i;

function renderToken(token: string, key: number): ReactNode {
	const own = token.match(OWN_HOST);
	if (own) {
		return (
			<Link key={key} href={own[1] || "/"} className={styles.link}>
				{token}
			</Link>
		);
	}

	if (/^https?:\/\//i.test(token)) {
		return (
			<a
				key={key}
				href={token}
				target="_blank"
				rel="noopener noreferrer"
				className={styles.link}
			>
				{token}
			</a>
		);
	}

	if (token.includes("@")) {
		return (
			<a key={key} href={`mailto:${token}`} className={styles.link}>
				{token}
			</a>
		);
	}

	return (
		<a
			key={key}
			href={`tel:${token.replace(/[^\d+]/g, "")}`}
			className={styles.link}
		>
			{token}
		</a>
	);
}

export function linkify(text: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let cursor = 0;
	let key = 0;

	for (const match of text.matchAll(TOKEN)) {
		const start = match.index ?? 0;
		// Точка или запятая в конце предложения — не часть адреса.
		const token = match[0].replace(/[.,;:)»]+$/, "");
		if (start > cursor) nodes.push(text.slice(cursor, start));
		nodes.push(renderToken(token, key++));
		cursor = start + token.length;
	}

	if (cursor < text.length) nodes.push(text.slice(cursor));
	return nodes;
}

/** «Срок хранения: …», «Важно: …» — подпись перед двоеточием. */
const LABEL = /^([А-ЯЁA-Z][^:.;]{1,30}):\s+/;

/**
 * Строка абзаца или пункта списка. Короткая подпись в начале («ОГРН:»,
 * «Важно:») набирается полужирным: в реквизитах и перечнях глаз ищет
 * именно подпись, а не значение.
 */
export function ConsentInline({ text }: { text: string }) {
	const label = text.match(LABEL);
	if (!label) return <>{linkify(text)}</>;

	return (
		<>
			<strong>{label[1]}:</strong> {linkify(text.slice(label[0].length))}
		</>
	);
}
