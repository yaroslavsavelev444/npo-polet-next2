// src/payload/collections/Faq.ts
import type { CollectionConfig } from "payload";
import { slugify } from "transliteration";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

// Аналог старой пары FaqTopic + вложенный FaqQuestion (Mongoose) — здесь это
// одна коллекция "тем" с вопросами как array-подполем, без отдельной
// коллекции для вопросов (в старой системе FaqQuestion существовал только
// как embedded-документ внутри topic.questions, отдельной моделью
// фактически не пользовались).
//
// ────────────────────────────────────────────────────────────────────────────
// ПОЧЕМУ НЕТ versions/drafts
// ────────────────────────────────────────────────────────────────────────────
// «Публиковать/скрывать» здесь уже решает чекбокс isActive — тот же приём, что
// в categories, banners и consents. Включать versions ради второго способа
// сказать то же самое означало бы завести таблицы _faq_v и два независимых
// признака видимости, которые рано или поздно разойдутся. Черновики нужны там,
// где правку готовят долго и по частям (товары, статьи базы знаний); ответ на
// вопрос FAQ пишется за один заход.

export const Faq: CollectionConfig = {
	slug: "faq",

	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "order", "isActive", "updatedAt"],
		group: "Контент",
		description: "Часто задаваемые вопросы, сгруппированные по темам",
	},

	access: {
		read: () => true,
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		// getCachedFaqTopics кэширует список с revalidate:false — без этого
		// хука изменения FAQ не появлялись бы на сайте до редеплоя.
		afterChange: [createRevalidateCacheHook("faq")],
		afterDelete: [createRevalidateCacheHook("faq")],
	},

	fields: [
		{
			name: "title",
			type: "text",
			required: true,
			label: "Название темы",
		},
		{
			name: "description",
			type: "textarea",
			label: "Описание темы",
		},
		{
			// Якорь темы на странице /faq: ссылка вида /faq#dostavka переживает
			// переименование темы, а ссылка на порядковый номер — нет.
			//
			// Транслитерация той же библиотекой, что и слаги товаров
			// (см. scripts/backfill-product-slugs.ts), чтобы «Доставка и
			// оплата» везде превращалась в одно и то же.
			name: "slug",
			type: "text",
			label: "Якорь (slug)",
			index: true,
			admin: {
				position: "sidebar",
				description:
					"Заполняется автоматически из названия. Менять только если ссылка на тему уже где-то опубликована.",
			},
			hooks: {
				beforeValidate: [
					({ value, siblingData }) => {
						if (typeof value === "string" && value.trim()) {
							return slugify(value.trim(), { lowercase: true });
						}
						const title = (siblingData as { title?: string })?.title;
						return title ? slugify(title, { lowercase: true }) : value;
					},
				],
			},
		},
		{
			name: "order",
			type: "number",
			defaultValue: 0,
			index: true,
			label: "Порядок",
			admin: {
				position: "sidebar",
				description: "Меньше — выше в списке.",
			},
		},
		{
			name: "isActive",
			type: "checkbox",
			defaultValue: true,
			index: true,
			label: "Показывать на сайте",
			admin: { position: "sidebar" },
		},
		{
			name: "questions",
			type: "array",
			label: "Вопросы",
			admin: {
				// Строки массива в админке подписываются самим вопросом —
				// иначе список выглядит как «Вопрос 1… Вопрос 7», и найти
				// нужный можно только раскрыв все.
				components: {
					RowLabel:
						"@/payload/collections/FaqQuestionRowLabel#FaqQuestionRowLabel",
				},
				initCollapsed: true,
			},
			fields: [
				{ name: "question", type: "text", required: true, label: "Вопрос" },
				{
					// richText, а не textarea: в ответах регулярно нужны список
					// («что входит в комплект»), ссылка на карточку товара и
					// выделение. Раньше это было простым текстом, и такие
					// ответы приходилось писать сплошным абзацем.
					//
					// Редактор — конфигурация по умолчанию из payload.config.ts.
					// Расширенный набор (заголовки, таблицы, загрузки) здесь
					// избыточен: ответ на вопрос — это абзац-другой.
					name: "answer",
					type: "richText",
					required: true,
					label: "Ответ",
				},
				{
					name: "slug",
					type: "text",
					label: "Якорь вопроса",
					admin: {
						description:
							"Заполняется автоматически. Даёт прямую ссылку вида /faq#dostavka-sroki.",
					},
					hooks: {
						beforeValidate: [
							({ value, siblingData }) => {
								if (typeof value === "string" && value.trim()) {
									return slugify(value.trim(), { lowercase: true });
								}
								const question = (siblingData as { question?: string })
									?.question;
								return question
									? slugify(question, { lowercase: true })
									: value;
							},
						],
					},
				},
				{
					// Отбор на главную — явный, а не «первые пять по порядку».
					// Порядок в теме подчиняется логике чтения всей страницы
					// FAQ, а на главную нужны самые частые вопросы, и это
					// разные множества.
					name: "isFeatured",
					type: "checkbox",
					defaultValue: false,
					index: true,
					label: "Показывать на главной",
					admin: {
						description:
							"На главную попадают отмеченные вопросы — не больше пяти, в общем порядке.",
					},
				},
				{ name: "order", type: "number", defaultValue: 0, label: "Порядок" },
				{
					name: "isActive",
					type: "checkbox",
					defaultValue: true,
					label: "Показывать",
				},
			],
		},

		legacyIdField,
	],

	timestamps: true,
};
