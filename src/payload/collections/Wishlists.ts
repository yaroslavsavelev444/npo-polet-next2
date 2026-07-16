import type { CollectionConfig } from "payload";

import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { isLoggedIn } from "../access/isLoggedIn.ts";
import { ownedByUserOrStaff } from "../access/ownership.ts";
import { legacyIdField } from "../fields/legacyId.ts";

export const Wishlists: CollectionConfig = {
	slug: "wishlists",

	admin: {
		useAsTitle: "user",
		defaultColumns: ["user", "updatedAt"],
		group: "Магазин",
	},

	access: {
		// Владелец — только своё, персонал — всё. См. ownership.ts.
		read: ownedByUserOrStaff,
		create: isLoggedIn,
		// Раньше здесь было `!!req.user` — ЛЮБОЙ авторизованный покупатель мог
		// переписать чужое избранное по прямому id (PATCH /api/wishlists/1),
		// даже не повышая себе роль. Проверка владельца обязательна.
		update: ownedByUserOrStaff,
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			unique: true,
			index: true,
		},

		{
			name: "items",
			type: "array",
			minRows: 0,

			fields: [
				{
					name: "product",
					type: "relationship",
					relationTo: "products",
					required: true,
				},

				{
					name: "addedAt",
					type: "date",
					defaultValue: () => new Date().toISOString(),
				},

				{
					name: "notes",
					type: "textarea",
					maxLength: 500,
				},
			],
		},

		{
			name: "totalItems",
			type: "number",
			admin: {
				readOnly: true,
			},
		},

		legacyIdField,
	],

	hooks: {
		beforeChange: [
			({ data }) => {
				data.totalItems = data.items?.length ?? 0;

				return data;
			},
		],
	},
};
