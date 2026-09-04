import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";
import { generateSlug } from "../utils/generateSlug.ts";

/**
 * Необязательная секция внутри раздела базы знаний («Ручные сеткомёты»,
 * «Трёхзарядные сеткомёты»).
 *
 * Почему отдельная коллекция, а не массив внутри раздела: на секцию должна
 * ссылаться статья, а связь (`relationship`) в Payload может указывать только
 * на документ коллекции — на строку массива внутри другого документа сослаться
 * нечем. Массив пришлось бы дублировать строковым ключом в статье и вручную
 * следить за целостностью при переименовании и удалении.
 *
 * Секция сознательно НЕ участвует в адресе статьи. Это группировка для
 * читателя, а не часть идентичности материала: секции переименовывают и
 * перетасовывают чаще всего, и попадание их в URL означало бы регулярные
 * редиректы на ровном месте. Раздел в адресе есть, секция — нет.
 */
export const KnowledgeSections: CollectionConfig = {
	slug: "knowledge-sections",
	labels: { singular: "Секция базы знаний", plural: "Секции базы знаний" },

	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "category", "order", "isActive", "updatedAt"],
		group: "База знаний",
		description:
			"Необязательный второй уровень. Нужен только там, где в разделе накопилось столько статей, что плоский список перестал читаться.",
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
			name: "category",
			type: "relationship",
			relationTo: "knowledge-categories",
			required: true,
			index: true,
			label: "Раздел",
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
			label: "Ключ (slug)",
			hooks: { beforeValidate: [generateSlug] },
			admin: {
				position: "sidebar",
				description:
					"Используется в параметре фильтра ?section=. В адресе статьи не участвует.",
			},
		},
		{
			name: "description",
			type: "textarea",
			label: "Описание",
		},
		{
			name: "order",
			type: "number",
			defaultValue: 0,
			index: true,
			label: "Порядок",
			admin: {
				position: "sidebar",
				description: "Порядок внутри раздела. Меньше — выше.",
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
	],
};
