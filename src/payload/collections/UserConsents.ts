import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";

export const UserConsents: CollectionConfig = {
	slug: "user-consents",

	admin: {
		group: "Пользователи",
		useAsTitle: "consentSlug",
		defaultColumns: ["user", "consentSlug", "version", "acceptedAt"],
		description: "Журнал принятых пользователями соглашений",
	},

	access: {
		// Пользователь может читать только свои согласия
		read: ({ req }) => {
			if (!req.user) return false;
			if (req.user.role === "admin" || req.user.role === "superadmin")
				return true;
			return { user: { equals: req.user.id } };
		},
		// Создаётся только через Local API при регистрации
		create: () => false,
		// Неизменяемые записи — юридический аудит
		update: () => false,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
			label: "Пользователь",
		},
		{
			// Связь с документом согласия для будущих запросов
			name: "consent",
			type: "relationship",
			relationTo: "consents",
			required: true,
			label: "Документ согласия",
		},
		{
			// Денормализованный slug — для быстрых запросов без JOIN
			name: "consentSlug",
			type: "text",
			required: true,
			index: true,
			label: "Slug согласия",
			admin: { readOnly: true },
		},
		{
			// Версия документа на момент принятия — важно для юридического аудита
			name: "version",
			type: "text",
			required: true,
			label: "Версия документа",
			admin: { readOnly: true },
		},
		{
			name: "acceptedAt",
			type: "date",
			required: true,
			label: "Принято в",
			admin: { readOnly: true },
		},
		{
			// IP для юридического аудита
			name: "ip",
			type: "text",
			label: "IP адрес",
			admin: { readOnly: true },
		},
		{
			name: "userAgent",
			type: "text",
			label: "User Agent",
			admin: { readOnly: true },
		},

		legacyIdField,
	],
};
