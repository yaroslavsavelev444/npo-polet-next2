import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";
import { trackPreviousSlug } from "../hooks/trackPreviousSlug.ts";
import { generateSlug } from "../utils/generateSlug.ts";

/**
 * Верхнеуровневый раздел базы знаний («Руководства», «Обслуживание», ...).
 *
 * Отдельная коллекция, а не значение select у статьи: разделу нужны
 * собственный slug (он в адресе статьи), описание, порядок и SEO — всё это
 * невозможно повесить на строковое значение. Каталог товаров устроен так же
 * (см. Categories.ts), и это осознанно один и тот же приём, а не дубль:
 * разделы базы знаний и категории товаров живут по разным правилам и
 * пересекаться не должны.
 */
export const KnowledgeCategories: CollectionConfig = {
	slug: "knowledge-categories",
	labels: { singular: "Раздел базы знаний", plural: "Разделы базы знаний" },

	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "slug", "order", "isActive", "updatedAt"],
		group: "База знаний",
		description:
			"Верхний уровень базы знаний. Внутри раздела статьи можно дополнительно сгруппировать по секциям.",
	},

	// Список в админке сразу в том порядке, в котором его увидит посетитель —
	// иначе редактор правит `order` вслепую.
	defaultSort: "order",

	access: {
		read: () => true,
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		beforeChange: [trackPreviousSlug],
		// Данные базы знаний кэшируются с revalidate:false (см.
		// services/knowledge.service.ts) — без инвалидации правки не появились
		// бы на сайте до редеплоя. Тег общий на весь модуль: разделы, секции и
		// статьи всегда читаются вместе, и раздельная инвалидация дала бы
		// рассогласованную выдачу (статья уже в новом разделе, а сам раздел ещё
		// старый).
		afterChange: [createRevalidateCacheHook("knowledge")],
		afterDelete: [createRevalidateCacheHook("knowledge")],
	},

	fields: [
		{
			name: "title",
			type: "text",
			required: true,
			index: true,
			label: "Название",
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
			label: "Адрес (slug)",
			hooks: { beforeValidate: [generateSlug] },
			admin: {
				position: "sidebar",
				description:
					"Часть адреса: /knowledge/<slug>. Заполняется автоматически из названия и не меняется при переименовании — менять вручную только осознанно.",
			},
		},
		{
			// Заполняется хуком trackPreviousSlug при ручной смене slug: старый
			// адрес уже мог быть проиндексирован, и без 301 он превратился бы в
			// 404 вместе со всем накопленным весом страницы.
			name: "previousSlugs",
			type: "array",
			label: "Прежние адреса",
			admin: {
				position: "sidebar",
				readOnly: true,
				description: "Ведут на текущий адрес 301-редиректом.",
				condition: (data) => Boolean(data?.previousSlugs?.length),
			},
			fields: [{ name: "slug", type: "text" }],
		},
		{
			name: "description",
			type: "textarea",
			label: "Описание",
			admin: {
				description:
					"Одно-два предложения. Видно на странице базы знаний под названием раздела.",
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
				description:
					"Меньше — выше. Разделы с одинаковым числом сортируются по названию.",
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
			name: "seo",
			type: "group",
			label: "SEO",
			fields: [
				{ name: "metaTitle", type: "text", label: "Meta Title" },
				{
					name: "metaDescription",
					type: "textarea",
					label: "Meta Description",
				},
			],
		},
	],
};
