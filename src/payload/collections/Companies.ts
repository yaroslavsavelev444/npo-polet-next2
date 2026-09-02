// src/collections/Companies.ts

import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

export const Companies: CollectionConfig = {
	slug: "companies",

	admin: {
		useAsTitle: "companyName",
		defaultColumns: ["companyName", "taxNumber", "contactPerson", "createdAt"],
		group: "Клиенты",
	},

	access: {
		// Владелец — только свои организации, персонал — все. См. ownership.ts.
		read: ownedByUserOrStaff,
// Создание закрыто для покупателей: поле-владелец `user` не имеет
		// field-level access, поэтому `isLoggedIn` позволял любому вошедшему
		// создать документ, записав в `user` ЧУЖОЙ id (mass assignment), а заодно
		// плодить документы без ограничений. Легитимный путь — сервисы
		// (payload.create с overrideAccess: true), которые подставляют владельца
		// из проверенной сессии; персоналу создание из админки оставлено.
		create: isAdminOrSuperAdmin,
		// Раньше здесь было `isLoggedIn` — любой авторизованный покупатель мог
		// править чужие реквизиты (ИНН, юр. адрес) по прямому id.
		update: ownedByUserOrStaff,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			index: true,
		},

		{
			name: "companyName",
			type: "text",
			required: true,
			index: true,
		},

		{
			name: "legalAddress",
			type: "textarea",
			required: true,
		},

		{
			name: "companyAddress",
			type: "textarea",
		},

		{
			name: "taxNumber",
			type: "text",
			required: true,
			index: true,
		},

		{
			name: "contactPerson",
			type: "text",
		},

		{
			name: "phone",
			type: "text",
		},

		{
			name: "email",
			type: "email",
		},

		legacyIdField,
	],

	hooks: {
		beforeChange: [
			({ data }) => {
				if (data?.taxNumber) {
					data.taxNumber = data.taxNumber.replace(/\s/g, "");
				}

				return data;
			},
		],
		afterChange: [createRevalidateCacheHook("companies")],
		afterDelete: [createRevalidateCacheHook("companies")],
	},

	// indexes: [
	//   {
	//     fields: {
	//       taxNumber: 1,
	//       user: 1,
	//     },
	//     options: {
	//       unique: true,
	//     },
	//   },
	//   {
	//     fields: {
	//       companyName: "text",
	//       taxNumber: "text",
	//     },
	//   },
	// ],
};
