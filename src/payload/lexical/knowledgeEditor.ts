import {
	AlignFeature,
	BlockquoteFeature,
	BlocksFeature,
	BoldFeature,
	EXPERIMENTAL_TableFeature,
	FixedToolbarFeature,
	HeadingFeature,
	HorizontalRuleFeature,
	IndentFeature,
	InlineCodeFeature,
	InlineToolbarFeature,
	ItalicFeature,
	LinkFeature,
	lexicalEditor,
	OrderedListFeature,
	ParagraphFeature,
	StrikethroughFeature,
	SubscriptFeature,
	SuperscriptFeature,
	UnderlineFeature,
	UnorderedListFeature,
	UploadFeature,
} from "@payloadcms/richtext-lexical";
import { NoteBlock } from "../collections/blocks/knowledge/NoteBlock.ts";
import { VideoEmbedBlock } from "../collections/blocks/knowledge/VideoEmbedBlock.ts";
import { VideoFileBlock } from "../collections/blocks/knowledge/VideoFileBlock.ts";

/**
 * Редактор содержимого статей базы знаний.
 *
 * Почему Lexical, а не прежние `type: "blocks"`: старая схема (heading / text /
 * image / link) заставляла собирать статью из отдельных карточек и не давала
 * ни списков, ни таблиц, ни форматирования внутри абзаца — ссылку нельзя было
 * поставить в предложении, только отдельным блоком. Lexical — штатный редактор
 * Payload 3 (@payloadcms/richtext-lexical уже в зависимостях), хранит контент
 * структурированным JSON, а не HTML: на рендере он превращается в React-дерево
 * (см. modules/knowledge/components/content), поэтому dangerouslySetInnerHTML
 * не нужен нигде и XSS через содержимое статьи невозможен в принципе.
 *
 * Набор возможностей ограничен тем, что реально нужно руководствам и
 * инструкциям. Блочного редактора кода здесь нет намеренно: на сайте
 * производителя сеткомётов ему нечего показывать (для артикулов и обозначений
 * хватает инлайнового `code`).
 *
 * Заголовки начинаются с h2: h1 на странице статьи ровно один — её заголовок,
 * и позволять редактору создавать второй значит ломать структуру документа и
 * его разбор поисковиками.
 */
export const knowledgeEditor = lexicalEditor({
	features: [
		ParagraphFeature(),
		HeadingFeature({ enabledHeadingSizes: ["h2", "h3", "h4"] }),
		BoldFeature(),
		ItalicFeature(),
		UnderlineFeature(),
		StrikethroughFeature(),
		SubscriptFeature(),
		SuperscriptFeature(),
		InlineCodeFeature(),
		AlignFeature(),
		IndentFeature(),
		UnorderedListFeature(),
		OrderedListFeature(),
		BlockquoteFeature(),
		HorizontalRuleFeature(),
		EXPERIMENTAL_TableFeature(),

		// Ссылки: и внешние, и внутренние на документы сайта. Внутренние
		// хранятся как связь с документом, а не как строка URL, — при смене
		// slug ссылка продолжает вести куда надо (адрес собирается на рендере,
		// см. internalDocToHref).
		LinkFeature({
			enabledCollections: ["knowledge-topics", "products", "categories"],
			fields: ({ defaultFields }) => [
				...defaultFields,
				{
					name: "rel",
					type: "select",
					hasMany: true,
					options: ["noopener", "noreferrer", "nofollow"],
					admin: {
						description:
							"Дополнительные rel для внешних ссылок. noopener/noreferrer проставляются автоматически.",
					},
				},
			],
		}),

		// Картинки внутри текста. Загрузка идёт в ту же коллекцию media, что и
		// весь остальной медиаконтент проекта — отдельного хранилища для базы
		// знаний не заводим.
		UploadFeature({
			collections: {
				media: {
					fields: [
						{
							name: "caption",
							type: "text",
							label: "Подпись",
						},
					],
				},
			},
		}),

		BlocksFeature({
			blocks: [VideoEmbedBlock, VideoFileBlock, NoteBlock],
		}),

		FixedToolbarFeature(),
		InlineToolbarFeature(),
	],
});
