// import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { createHash } from "node:crypto";
import type { CollectionConfig } from "payload";
import { getRelationshipUser } from "../access/getRelationshipUser.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * beforeChange hook — аналог Mongoose pre('save').
 *
 * При изменении content или documentUrl:
 *  1. Записываем текущую (старую) версию в history
 *  2. Инкрементируем patch-версию (semver)
 *  3. Обновляем checksum SHA-256
 */
const versioningHook = async ({ data, originalDoc, operation, req }: any) => {
	// Срабатывает только при обновлении существующего документа
	if (operation !== "update" || !originalDoc) return data;

	const contentChanged = data.content && data.content !== originalDoc.content;
	const urlChanged =
		data.documentUrl && data.documentUrl !== originalDoc.documentUrl;

	if (!contentChanged && !urlChanged) return data;

	// 1. Сохраняем предыдущую версию в history
	const prevEntry = {
		version: originalDoc.version ?? "1.0.0",
		content: originalDoc.content,
		documentUrl: originalDoc.documentUrl ?? null,
		changeDescription:
			data._changeDescription ?? "Автоматическое сохранение истории",
	};

	data.history = [...(originalDoc.history ?? []), prevEntry];

	// 2. Инкрементируем patch
	const [major, minor, patch] = (originalDoc.version ?? "1.0.0")
		.split(".")
		.map(Number);
	data.version = `${major}.${minor}.${patch + 1}`;

	// 3. Checksum через node:crypto (синхронно)
	data.checksum = createHash("sha256")
		.update(data.content ?? originalDoc.content)
		.digest("hex");

	data.lastUpdatedAt = new Date().toISOString();

	const author = getRelationshipUser(req);

	if (author) {
		data.lastUpdatedBy = author;
	}

	delete data._changeDescription;

	return data;
};

// ─── Collection ───────────────────────────────────────────────────────────────

export const Consents: CollectionConfig = {
	slug: "consents",

	admin: {
		useAsTitle: "title",
		defaultColumns: ["title", "slug", "version", "isActive", "isRequired"],
		group: "Контент",
		description:
			"Согласия пользователей (политика конфиденциальности, оферта и т.д.)",
	},

	access: {
		read: () => true, // публичный доступ — клиент читает тексты согласий
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},

	hooks: {
		beforeChange: [versioningHook],
		afterChange: [createRevalidateCacheHook("consents")],
		afterDelete: [createRevalidateCacheHook("consents")],
	},

	fields: [
		// ── Основное ─────────────────────────────────────────────────────────────
		{
			name: "title",
			type: "text",
			required: true,
			label: "Заголовок",
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			index: true,
			label: "Slug (идентификатор)",
			admin: {
				position: "sidebar",
				description: "Только латиница, цифры, _ и -",
			},
		},
		{
			name: "description",
			type: "textarea",
			label: "Краткое описание",
		},
		{
			name: "content",
			type: "textarea",
			required: true,
			// editor: lexicalEditor(),
		},
		{
			name: "documentUrl",
			type: "text",
			label: "Ссылка на документ (URL)",
			admin: {
				description: "Внешняя ссылка на PDF/документ",
			},
		},

		// ── Флаги ────────────────────────────────────────────────────────────────
		{
			name: "isRequired",
			type: "checkbox",
			defaultValue: true,
			label: "Обязательное согласие",
			admin: { position: "sidebar" },
		},
		{
			name: "needsAcceptance",
			type: "checkbox",
			required: true,
			defaultValue: true,
			label: "Требует принятия",
			admin: { position: "sidebar" },
		},
		{
			name: "isActive",
			type: "checkbox",
			required: true,
			defaultValue: true,
			label: "Активно",
			index: true,
			admin: { position: "sidebar" },
		},

		// ── Версионирование ───────────────────────────────────────────────────────
		{
			name: "version",
			type: "text",
			defaultValue: "1.0.0",
			label: "Текущая версия (semver)",
			admin: {
				readOnly: true,
				position: "sidebar",
				description: "Инкрементируется автоматически при изменении контента",
			},
		},
		{
			name: "checksum",
			type: "text",
			label: "SHA-256 контента",
			admin: {
				readOnly: true,
				position: "sidebar",
			},
		},
		{
			name: "lastUpdatedAt",
			type: "date",
			label: "Дата последнего изменения",
			admin: {
				readOnly: true,
				position: "sidebar",
			},
		},
		{
			name: "lastUpdatedBy",
			type: "relationship",
			relationTo: ["admins", "users"],
			label: "Изменил",
			admin: {
				readOnly: true,
				position: "sidebar",
			},
		},

		// ── История версий ───────────────────────────────────────────────────────
		{
			name: "history",
			type: "array",
			label: "История версий",
			admin: {
				readOnly: true,
				description: "Заполняется автоматически при каждом изменении",
			},
			fields: [
				{
					name: "version",
					type: "text",
					required: true,
					label: "Версия",
				},
				{
					name: "content",
					type: "textarea",
					required: true,
					// editor: lexicalEditor(),
				},
				{
					name: "documentUrl",
					type: "text",
					label: "Ссылка на документ",
				},
				{
					name: "changeDescription",
					type: "text",
					label: "Описание изменений",
				},
				{
					name: "createdAt",
					type: "date",
					defaultValue: () => new Date().toISOString(),
					label: "Дата сохранения",
				},
			],
		},

		// ── Служебное поле для передачи описания изменения ───────────────────────
		{
			name: "_changeDescription",
			type: "text",
			label: "Описание изменений (для истории)",
			admin: {
				description:
					"Заполните перед сохранением — попадёт в историю версий и будет очищено",
			},
		},

		legacyIdField,
	],
};
