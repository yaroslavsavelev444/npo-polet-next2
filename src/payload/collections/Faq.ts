// src/payload/collections/Faq.ts
import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

// Аналог старой пары FaqTopic + вложенный FaqQuestion (Mongoose) — здесь это
// одна коллекция "тем" с вопросами как array-подполем, без отдельной
// коллекции для вопросов (в старой системе FaqQuestion существовал только
// как embedded-документ внутри topic.questions, отдельной моделью
// фактически не пользовались).
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
			name: "order",
			type: "number",
			defaultValue: 0,
			index: true,
			admin: { position: "sidebar" },
		},
		{
			name: "isActive",
			type: "checkbox",
			defaultValue: true,
			index: true,
			admin: { position: "sidebar" },
		},
		{
			name: "questions",
			type: "array",
			label: "Вопросы",
			fields: [
				{ name: "question", type: "text", required: true, label: "Вопрос" },
				{ name: "answer", type: "textarea", required: true, label: "Ответ" },
				{ name: "order", type: "number", defaultValue: 0 },
				{ name: "isActive", type: "checkbox", defaultValue: true },
			],
		},

		legacyIdField,
	],

	timestamps: true,
};
