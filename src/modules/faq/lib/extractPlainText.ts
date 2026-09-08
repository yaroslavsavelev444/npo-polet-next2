import type { FaqAnswer } from "../types";

/**
 * Разворачивает дерево Lexical в простой текст.
 *
 * Зачем: разметка FAQPage (schema.org) требует от ответа именно текст — дерево
 * узлов туда положить нельзя. Тот же результат используется поиском по
 * странице FAQ.
 *
 * Почему свой обход, а не $convertToPlainText из @payloadcms/richtext-lexical:
 * та функция ожидает живой EditorState и тянет за собой рантайм редактора —
 * несколько десятков килобайт в серверный бандл ради склейки строк. Здесь
 * нужен обход обычного JSON, который Payload и так отдаёт.
 *
 * Обход защищён от циклов и от аномально глубоких деревьев: содержимое
 * приходит из админки, но структура узлов задаётся редактором, а не схемой, и
 * рекурсия без ограничителя — это способ уронить рендер страницы кривым
 * документом.
 */

interface LexicalNode {
	type?: string;
	text?: string;
	children?: LexicalNode[];
}

const MAX_DEPTH = 24;

// Узлы, после которых в простом тексте нужен разрыв: иначе абзацы и пункты
// списка склеиваются в одно предложение без пробела.
const BLOCK_TYPES = new Set([
	"paragraph",
	"listitem",
	"list",
	"heading",
	"quote",
	"linebreak",
]);

function walk(node: LexicalNode, out: string[], depth: number): void {
	if (!node || depth > MAX_DEPTH) return;

	if (typeof node.text === "string" && node.text) {
		out.push(node.text);
	}

	if (Array.isArray(node.children)) {
		for (const child of node.children) walk(child, out, depth + 1);
	}

	if (node.type && BLOCK_TYPES.has(node.type)) out.push("\n");
}

export function extractPlainText(answer: FaqAnswer | null | undefined): string {
	const root = (answer as { root?: LexicalNode } | null | undefined)?.root;
	if (!root) return "";

	const parts: string[] = [];
	walk(root, parts, 0);

	return parts
		.join("")
		.replace(/[ \t]+/g, " ")
		.replace(/\s*\n\s*/g, "\n")
		.replace(/\n{2,}/g, "\n")
		.trim();
}
