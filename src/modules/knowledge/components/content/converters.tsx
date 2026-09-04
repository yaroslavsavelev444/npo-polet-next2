import type { SerializedLexicalNode } from "@payloadcms/richtext-lexical/lexical";
import type { JSXConvertersFunction } from "@payloadcms/richtext-lexical/react";
import { LinkJSXConverter } from "@payloadcms/richtext-lexical/react";
import { ExternalLink } from "lucide-react";
import { slugify } from "transliteration";
import type { Media } from "@/payload-types";
import { ContentImage } from "./ContentImage";
import { NoteCallout } from "./NoteCallout";
import { VideoEmbed, VideoFile } from "./VideoBlocks";

/**
 * Конвертеры lexical → React для содержимого статей.
 *
 * Здесь нет ни одной строки HTML: узлы становятся React-элементами, а текст —
 * текстовыми узлами, которые React экранирует сам. Поэтому содержимое статьи
 * не может вынести на страницу разметку, даже если бы кто-то положил её в
 * поле — dangerouslySetInnerHTML не используется нигде в цепочке рендера.
 */

type LexicalNode = { type?: string; [key: string]: unknown };

type NodesToJSX = (args: {
	nodes: SerializedLexicalNode[];
}) => React.ReactNode[];

type ConverterArgs = { node: LexicalNode; nodesToJSX: NodesToJSX };

/** Собирает текст заголовка, чтобы построить якорь для ссылки на раздел. */
function nodeText(node: LexicalNode): string {
	if (typeof node.text === "string") return node.text;
	if (Array.isArray(node.children)) {
		return (node.children as LexicalNode[]).map(nodeText).join("");
	}
	return "";
}

function headingId(node: LexicalNode): string | undefined {
	const text = nodeText(node).trim();
	if (!text) return undefined;
	return slugify(text, { lowercase: true, separator: "-" }) || undefined;
}

function isMedia(value: unknown): value is Media {
	return (
		Boolean(value) && typeof value === "object" && "url" in (value as object)
	);
}

/**
 * Адрес внутренней ссылки собирается на рендере из документа, а не хранится
 * строкой: при переименовании slug ссылка продолжит вести куда надо.
 */
function internalDocToHref({
	linkNode,
}: {
	linkNode: {
		fields: { doc?: { relationTo?: string; value?: unknown } | null };
	};
}): string {
	const doc = linkNode.fields?.doc;
	const value = doc?.value;

	if (!value || typeof value !== "object") return "#";

	const target = value as {
		slug?: string | null;
		category?: unknown;
	};
	if (!target.slug) return "#";

	const categorySlug =
		target.category && typeof target.category === "object"
			? ((target.category as { slug?: string | null }).slug ?? null)
			: null;

	switch (doc?.relationTo) {
		case "knowledge-topics":
			return categorySlug
				? `/knowledge/${categorySlug}/${target.slug}`
				: `/knowledge`;
		case "products":
			return categorySlug
				? `/category/${categorySlug}/products/${target.slug}`
				: "/category";
		case "categories":
			return `/category/${target.slug}`;
		default:
			return "#";
	}
}

/**
 * Заголовки внутри статьи начинаются с h2 — h1 на странице занят названием
 * материала. Уровни из редактора понижаются на соответствующие им теги, чтобы
 * структура документа оставалась корректной для скринридеров и поисковиков.
 *
 * Якорь на каждом заголовке позволяет дать ссылку на конкретный пункт
 * руководства; сам якорь скрыт до наведения, чтобы не засорять текст.
 */
const HEADING_TAGS: Record<string, "h2" | "h3" | "h4"> = {
	h1: "h2",
	h2: "h2",
	h3: "h3",
	h4: "h4",
	h5: "h4",
	h6: "h4",
};

const HEADING_STYLES: Record<"h2" | "h3" | "h4", string> = {
	h2: "mt-12 text-2xl sm:text-[1.75rem] tracking-[-0.02em]",
	h3: "mt-9 text-xl sm:text-2xl tracking-[-0.015em]",
	h4: "mt-7 text-lg sm:text-xl",
};

function HeadingConverter({
	node,
	nodesToJSX,
}: {
	node: LexicalNode;
	nodesToJSX: NodesToJSX;
}) {
	const Tag = HEADING_TAGS[String(node.tag)] ?? "h2";
	const id = headingId(node);
	const children = nodesToJSX({
		nodes: (node.children as SerializedLexicalNode[]) ?? [],
	});

	return (
		<Tag
			id={id}
			className={`group scroll-mt-[calc(var(--sticky-header-height)+1.5rem)] font-semibold leading-snug text-[var(--text-primary)] first:mt-0 ${HEADING_STYLES[Tag]}`}
		>
			{children}
			{id && (
				<a
					href={`#${id}`}
					aria-label="Ссылка на этот раздел"
					className="ml-2 inline-block align-middle text-[0.7em] text-[var(--text-muted)] opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100"
				>
					#
				</a>
			)}
		</Tag>
	);
}

export const knowledgeConverters: JSXConvertersFunction = ({
	defaultConverters,
}) => ({
	...defaultConverters,
	...LinkJSXConverter({ internalDocToHref }),

	heading: HeadingConverter,

	// Картинки: next/image вместо голого <img> из штатного конвертера.
	upload: ({ node }: ConverterArgs) => {
		const value = (node as { value?: unknown }).value;
		if (!isMedia(value)) return null;

		if (!value.mimeType?.startsWith("image")) {
			return (
				<p className="my-6">
					<a
						href={value.url ?? "#"}
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 text-[var(--accent)] underline underline-offset-4 transition-colors hover:text-[var(--accent-hover)]"
					>
						{value.filename ?? "Скачать файл"}
						<ExternalLink size={14} aria-hidden />
					</a>
				</p>
			);
		}

		const fields = (
			node as { fields?: { caption?: string | null; alt?: string | null } }
		).fields;

		return (
			<ContentImage
				media={value}
				caption={fields?.caption}
				alt={fields?.alt ?? undefined}
			/>
		);
	},

	// ── Таблицы ────────────────────────────────────────────────────────────
	// Штатный конвертер зашивает в стили `border: 1px solid #ccc` и не даёт
	// таблице прокручиваться — на телефоне широкая таблица характеристик
	// растягивала бы страницу и ломала вёрстку всего документа.
	table: ({ node, nodesToJSX }: ConverterArgs) => (
		<div className="-mx-4 my-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
			<table className="w-full min-w-[36rem] border-collapse overflow-hidden rounded-[var(--radius-sm)] text-sm">
				<tbody>
					{nodesToJSX({
						nodes: node.children as SerializedLexicalNode[],
					})}
				</tbody>
			</table>
		</div>
	),

	tablerow: ({ node, nodesToJSX }: ConverterArgs) => (
		<tr className="border-b border-[var(--border)] last:border-b-0">
			{nodesToJSX({ nodes: node.children as SerializedLexicalNode[] })}
		</tr>
	),

	tablecell: ({ node, nodesToJSX }: ConverterArgs) => {
		const cell = node as {
			children: SerializedLexicalNode[];
			headerState?: number;
			colSpan?: number;
			rowSpan?: number;
		};
		const isHeader = (cell.headerState ?? 0) > 0;
		const Tag = isHeader ? "th" : "td";

		return (
			<Tag
				colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
				rowSpan={cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined}
				scope={isHeader ? "col" : undefined}
				className={
					isHeader
						? "border-b border-[var(--border-light)] bg-[var(--surface-secondary)] !px-3.5 !py-2.5 text-left align-top font-semibold text-[var(--text-primary)]"
						: "!px-3.5 !py-2.5 align-top text-[var(--text-secondary)]"
				}
			>
				{nodesToJSX({ nodes: cell.children })}
			</Tag>
		);
	},

	// ── Блоки ──────────────────────────────────────────────────────────────
	blocks: {
		videoEmbed: ({ node }: ConverterArgs) => {
			const fields = (
				node as {
					fields: {
						url: string;
						title?: string | null;
						caption?: string | null;
					};
				}
			).fields;
			return (
				<VideoEmbed
					url={fields.url}
					title={fields.title}
					caption={fields.caption}
				/>
			);
		},

		videoFile: ({ node }: ConverterArgs) => {
			const fields = (
				node as {
					fields: {
						video?: unknown;
						poster?: unknown;
						caption?: string | null;
					};
				}
			).fields;
			if (!isMedia(fields.video)) return null;
			return (
				<VideoFile
					video={fields.video}
					poster={isMedia(fields.poster) ? fields.poster : null}
					caption={fields.caption}
				/>
			);
		},

		note: ({ node }: ConverterArgs) => {
			const fields = (
				node as {
					fields: {
						variant?: "info" | "warning" | "tip";
						title?: string | null;
						text: string;
					};
				}
			).fields;
			return (
				<NoteCallout
					variant={fields.variant}
					title={fields.title}
					text={fields.text}
				/>
			);
		},
	},
});
