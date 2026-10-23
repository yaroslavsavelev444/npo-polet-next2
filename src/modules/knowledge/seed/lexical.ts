import { randomBytes } from "node:crypto";
import { slugify } from "transliteration";

/**
 * Сборщики lexical-JSON для статей, которые заводятся скриптом, а не руками.
 *
 * Форма узлов повторяет то, что сохраняет редактор knowledgeEditor (сверено с
 * документами, созданными в админке): лишнее поле или не тот `version` редактор
 * переживёт, но статья, открытая в админке, должна выглядеть так же, как
 * набранная руками, — иначе первая же правка превратит её в другой документ.
 *
 * Только то, что есть в knowledgeEditor: заголовки h2–h4, списки, таблицы,
 * ссылки (внешние и на документы), картинки из media, врезки, разделитель.
 */

export type LexicalNode = {
	type: string;
	version: number;
	[key: string]: unknown;
};

/** Биты поля `format` у текстового узла lexical. */
const FORMAT = { bold: 1, italic: 2, code: 16 } as const;

export type Inline = string | LexicalNode;

function textNode(text: string, format = 0): LexicalNode {
	return {
		type: "text",
		version: 1,
		text,
		format,
		detail: 0,
		mode: "normal",
		style: "",
	};
}

function inlines(parts: Inline[]): LexicalNode[] {
	return parts.map((part) =>
		typeof part === "string" ? textNode(part) : part,
	);
}

const element = { format: "", indent: 0, direction: "ltr" } as const;

export const b = (text: string) => textNode(text, FORMAT.bold);
export const i = (text: string) => textNode(text, FORMAT.italic);
export const code = (text: string) => textNode(text, FORMAT.code);

export function p(...parts: Inline[]): LexicalNode {
	return {
		type: "paragraph",
		version: 1,
		...element,
		textFormat: 0,
		textStyle: "",
		children: inlines(parts),
	};
}

export function h2(text: string): LexicalNode {
	return {
		type: "heading",
		version: 1,
		...element,
		tag: "h2",
		children: [textNode(text)],
	};
}

export function h3(text: string): LexicalNode {
	return {
		type: "heading",
		version: 1,
		...element,
		tag: "h3",
		children: [textNode(text)],
	};
}

/**
 * Якорь заголовка — тем же способом, что и на рендере (headingId в
 * components/content/converters.tsx). Ссылка «см. раздел 2» строится отсюда,
 * а не набирается руками: опечатка в якоре не ломает страницу, а молча
 * перестаёт вести куда-либо.
 */
export function anchor(headingText: string): string {
	return `#${slugify(headingText, { lowercase: true, separator: "-" })}`;
}

export function link(url: string, ...parts: Inline[]): LexicalNode {
	return {
		type: "link",
		version: 3,
		...element,
		fields: { linkType: "custom", url, newTab: false },
		children: inlines(parts),
	};
}

/** Ссылка на документ сайта: адрес собирается на рендере, смена slug её не ломает. */
export function docLink(
	relationTo: "products" | "knowledge-topics",
	id: number,
	...parts: Inline[]
): LexicalNode {
	return {
		type: "link",
		version: 3,
		...element,
		fields: {
			linkType: "internal",
			newTab: false,
			doc: { relationTo, value: id },
		},
		children: inlines(parts),
	};
}

function list(listType: "number" | "bullet", items: Inline[][]): LexicalNode {
	return {
		type: "list",
		version: 1,
		...element,
		listType,
		tag: listType === "number" ? "ol" : "ul",
		start: 1,
		children: items.map((parts, index) => ({
			type: "listitem",
			version: 1,
			...element,
			value: index + 1,
			children: inlines(parts),
		})),
	};
}

export const ol = (...items: Inline[][]) => list("number", items);
export const ul = (...items: Inline[][]) => list("bullet", items);

/** Таблица с заголовочной первой строкой. Ячейка — строка или набор инлайнов. */
export function table(
	header: string[],
	rows: (Inline | Inline[])[][],
): LexicalNode {
	const cell = (
		content: Inline | Inline[],
		headerState: number,
	): LexicalNode => ({
		type: "tablecell",
		version: 1,
		...element,
		colSpan: 1,
		rowSpan: 1,
		headerState,
		children: [p(...(Array.isArray(content) ? content : [content]))],
	});
	const row = (cells: LexicalNode[]): LexicalNode => ({
		type: "tablerow",
		version: 1,
		...element,
		children: cells,
	});

	return {
		type: "table",
		version: 1,
		...element,
		children: [
			// headerState: 1 — строка заголовка, 0 — обычная ячейка.
			row(header.map((text) => cell(b(text), 1))),
			...rows.map((cells) => row(cells.map((content) => cell(content, 0)))),
		],
	};
}

/** id узлов с собственными полями (upload, block) — как у редактора: 24 hex. */
function nodeId(): string {
	return randomBytes(12).toString("hex");
}

export function image(mediaId: number, caption?: string): LexicalNode {
	return {
		type: "upload",
		version: 3,
		format: "",
		id: nodeId(),
		relationTo: "media",
		value: mediaId,
		fields: caption ? { caption } : {},
	};
}

export function note(
	variant: "info" | "warning" | "tip",
	title: string,
	text: string,
): LexicalNode {
	return {
		type: "block",
		version: 2,
		format: "",
		fields: {
			id: nodeId(),
			blockName: "",
			blockType: "note",
			variant,
			title,
			text,
		},
	};
}

export function hr(): LexicalNode {
	return { type: "horizontalrule", version: 1 };
}

export function doc(children: LexicalNode[]) {
	return { root: { type: "root", version: 1, ...element, children } };
}
