import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { isLoggedIn } from "../access/isLoggedIn.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * beforeChange hook — аналог Mongoose pre('save').
 * Автоматически проставляет resolvedAt / closedAt при смене статуса.
 */
const setResolutionDates = ({ data, originalDoc, operation }: any) => {
	const status = data.status ?? originalDoc?.status;

	if (status === "resolved" && !data.resolvedAt && !originalDoc?.resolvedAt) {
		data.resolvedAt = new Date().toISOString();
	}

	if (status === "closed" && !data.closedAt && !originalDoc?.closedAt) {
		data.closedAt = new Date().toISOString();
	}

	return data;
};

// ─── Collection ───────────────────────────────────────────────────────────────

export const Feedbacks: CollectionConfig = {
	slug: "feedbacks",

	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "type", "status", "priority", "createdAt"],
		group: "Поддержка",
		description: "Обратная связь, баги и предложения от пользователей",
	},

	access: {
		// Пользователь видит только свои обращения, персонал — все.
		// См. ownership.ts.
		read: ownedByUserOrStaff,
		create: isLoggedIn,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		beforeChange: [setResolutionDates],
		afterChange: [createRevalidateCacheHook("feedbacks")],
		afterDelete: [createRevalidateCacheHook("feedbacks")],
	},

	fields: [
		// ── Основное ─────────────────────────────────────────────────────────────
		{
			name: "title",
			type: "text",
			required: true,
			maxLength: 200,
			label: "Заголовок",
		},
		{
			name: "description",
			type: "textarea",
			required: true,
			maxLength: 5000,
			label: "Описание",
		},

		// ── Классификация ────────────────────────────────────────────────────────
		{
			name: "type",
			type: "select",
			required: true,
			index: true,
			label: "Тип",
			options: [
				{ label: "Ошибка", value: "bug" },
				{ label: "Улучшение", value: "improvement" },
				{ label: "Функциональность", value: "feature" },
				{ label: "Другое", value: "other" },
			],
		},
		{
			name: "status",
			type: "select",
			defaultValue: "new",
			index: true,
			label: "Статус",
			options: [
				{ label: "Новый", value: "new" },
				{ label: "В работе", value: "in_progress" },
				{ label: "Решён", value: "resolved" },
				{ label: "Закрыт", value: "closed" },
				{ label: "Дубликат", value: "duplicate" },
				{ label: "Не будет исправлен", value: "wont_fix" },
			],
			admin: { position: "sidebar" },
		},
		{
			name: "priority",
			type: "select",
			defaultValue: "low",
			index: true,
			label: "Приоритет",
			options: [
				{ label: "Низкий", value: "low" },
				{ label: "Средний", value: "medium" },
				{ label: "Высокий", value: "high" },
				{ label: "Критический", value: "critical" },
			],
			admin: { position: "sidebar" },
		},

		// ── Пользователь ─────────────────────────────────────────────────────────
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			index: true,
			label: "Пользователь",
			admin: { position: "sidebar" },
		},
		{
			name: "userEmail",
			type: "email",
			label: "Email (если не авторизован)",
			admin: { position: "sidebar" },
		},
		{
			name: "userName",
			type: "text",
			label: "Имя (если не авторизован)",
			admin: { position: "sidebar" },
		},
		{
			name: "userRole",
			type: "select",
			label: "Роль пользователя",
			options: [
				{ label: "Пользователь", value: "user" },
				{ label: "Юрист", value: "lawyer" },
				{ label: "Администратор", value: "admin" },
				{ label: "Модератор", value: "moderator" },
			],
			admin: { position: "sidebar" },
		},

		// ── Назначение и теги ────────────────────────────────────────────────────
		{
			name: "assignedTo",
			type: "relationship",
			relationTo: "users",
			label: "Назначен",
			index: true,
		},
		{
			name: "tags",
			type: "array",
			label: "Теги",
			fields: [{ name: "tag", type: "text", required: true }],
		},

		// ── Вложения ─────────────────────────────────────────────────────────────
		{
			name: "attachments",
			type: "relationship",
			relationTo: "media",
			hasMany: true,
			label: "Вложения",
		},

		// ── Внутренние заметки ───────────────────────────────────────────────────
		{
			name: "internalNotes",
			type: "array",
			label: "Внутренние заметки",
			admin: { description: "Видны только сотрудникам" },
			fields: [
				{ name: "note", type: "textarea", required: true },
				{
					name: "createdBy",
					type: "relationship",
					relationTo: "users",
				},
				{
					name: "createdAt",
					type: "date",
					defaultValue: () => new Date().toISOString(),
				},
				{
					name: "isPrivate",
					type: "checkbox",
					defaultValue: false,
					label: "Приватная заметка",
				},
			],
		},

		// ── Активность ───────────────────────────────────────────────────────────
		{
			name: "viewCount",
			type: "number",
			defaultValue: 0,
			label: "Просмотры",
			admin: { readOnly: true },
		},
		{
			name: "upvotes",
			type: "number",
			defaultValue: 0,
			label: "Голоса «за»",
			admin: { readOnly: true },
		},
		{
			name: "upvotedBy",
			type: "relationship",
			relationTo: "users",
			hasMany: true,
			label: "Проголосовали",
		},

		// ── Связи ────────────────────────────────────────────────────────────────
		{
			name: "relatedTo",
			type: "relationship",
			relationTo: "feedbacks",
			hasMany: true,
			label: "Похожие обращения",
		},
		{
			name: "duplicateOf",
			type: "relationship",
			relationTo: "feedbacks",
			label: "Дубликат",
			admin: {
				condition: (data) => data?.status === "duplicate",
			},
		},

		// ── Даты ─────────────────────────────────────────────────────────────────
		{
			name: "resolvedAt",
			type: "date",
			label: "Дата решения",
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "closedAt",
			type: "date",
			label: "Дата закрытия",
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "dueDate",
			type: "date",
			label: "Срок",
			admin: { position: "sidebar" },
		},

		// ── Информация об устройстве ─────────────────────────────────────────────
		{
			name: "deviceInfo",
			type: "group",
			label: "Устройство",
			admin: { readOnly: true },
			fields: [
				{ name: "userAgent", type: "text" },
				{ name: "platform", type: "text" },
				{ name: "os", type: "text" },
				{ name: "browser", type: "text" },
				{ name: "screenResolution", type: "text" },
			],
		},
		{
			name: "ipAddress",
			type: "text",
			label: "IP адрес",
			admin: { readOnly: true },
		},
	],
};
