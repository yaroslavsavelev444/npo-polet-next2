import { Fragment } from "react";
import { splitByTerms } from "../lib/search";

/**
 * Подсветка совпадений в результатах поиска.
 *
 * Строка разбивается на React-узлы, а не склеивается в HTML со вставкой
 * <mark>: и запрос, и текст статьи — данные, а не разметка, и превращать их в
 * innerHTML значит открывать XSS ровно там, где ввод произвольный.
 *
 * <mark> выбран сознательно вместо <span> с фоном: это семантический тег
 * «выделено как релевантное», и скринридеры сообщают о нём.
 */
export function HighlightedText({
	text,
	terms,
}: {
	text: string;
	terms: string[];
}) {
	if (!text) return null;
	if (terms.length === 0) return <>{text}</>;

	const parts = splitByTerms(text, terms);

	return (
		<>
			{parts.map((part, index) =>
				part.match ? (
					// Индекс как ключ здесь безопасен: части — производные от
					// неизменной строки, их порядок и количество фиксированы.
					<mark
						key={index}
						className="rounded-[3px] bg-[var(--primary)]/20 px-0.5 text-[var(--text-primary)]"
					>
						{part.text}
					</mark>
				) : (
					<Fragment key={index}>{part.text}</Fragment>
				),
			)}
		</>
	);
}
