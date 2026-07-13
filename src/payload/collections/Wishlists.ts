import type { CollectionConfig } from "payload";

import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";

export const Wishlists: CollectionConfig = {
	slug: "wishlists",

	admin: {
		useAsTitle: "user",
		defaultColumns: ["user", "updatedAt"],
		group: "Магазин",
	},

	access: {
		read: ({ req }) => {
			if (!req.user) return false;

			if (req.user.role === "admin" || req.user.role === "superadmin") {
				return true;
			}

			return {
				user: {
					equals: req.user.id,
				},
			};
		},

		create: ({ req }) => !!req.user,

		update: ({ req }) => !!req.user,

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
