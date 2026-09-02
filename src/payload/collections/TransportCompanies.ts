import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

const TransportCompanies: CollectionConfig = {
	slug: "transport-companies",
	admin: {
		useAsTitle: "name",
		group: "Доставка",
		defaultColumns: ["name", "isActive", "phone"],
	},
	access: {
		read: () => true,
		// Явно перечисляем ВСЕ операции. Payload подставляет неуказанным свой
		// дефолт — `({ req }) => Boolean(req.user)` (см.
		// node_modules/payload/dist/auth/defaultAccess.js и
		// addDefaultsToCollectionConfig), а `req.user` — это в том числе
		// обычный покупатель из коллекции `users`. То есть коллекция, где был
		// объявлен только `read`, оставалась открытой на запись любому
		// зарегистрированному пользователю через POST/PATCH/DELETE
		// /api/<slug>: контент публичных страниц и справочники доставки можно
		// было править и удалять из обычного аккаунта.
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},
	hooks: {
		afterChange: [createRevalidateCacheHook("transport-companies")],
		afterDelete: [createRevalidateCacheHook("transport-companies")],
	},
	fields: [
		{ name: "name", type: "text", required: true },
		{ name: "phone", type: "text" },
		{ name: "website", type: "text" },
		{
			name: "trackingUrlTemplate",
			type: "text",
			admin: {
				description:
					"Шаблон URL для отслеживания, например https://track.ru/{trackingNumber}",
			},
		},
		{
			name: "isActive",
			type: "checkbox",
			defaultValue: true,
			index: true,
			admin: {
				position: "sidebar",
				description: "Показывать при оформлении заказа",
			},
		},

		legacyIdField,
	],
};

export default TransportCompanies;
