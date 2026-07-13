// src/payload/collections/Discounts.ts

import type { CollectionConfig } from "payload";
import { getRelationshipUser } from "../access/getRelationshipUser.ts";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { legacyIdField } from "../fields/legacyId.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

export const DiscountType = {
	PERCENTAGE: "percentage",
	FIXED: "fixed",
	QUANTITY_BASED: "quantity_based",
} as const;
export type DiscountTypeType = (typeof DiscountType)[keyof typeof DiscountType];

export const Discounts: CollectionConfig = {
	slug: "discounts",
	admin: {
		useAsTitle: "name",
		group: "E-Commerce",
		defaultColumns: [
			"name",
			"type",
			"discountPercent",
			"isActive",
			"priority",
			"updatedAt",
		],
	},
	access: {
		read: () => true,
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},
	hooks: {
		beforeChange: [
			({ req, data }) => {
				const author = getRelationshipUser(req);
				if (author) {
					if (!data.createdBy) {
						data.createdBy = author;
					}

					data.updatedBy = author;
				}
			},
		],
		// Discounts are cached with revalidate:false — without this, admin edits
		// would never be visible to shoppers until a redeploy.
		afterChange: [createRevalidateCacheHook("discounts")],
		afterDelete: [createRevalidateCacheHook("discounts")],
	},
	fields: [
		{ name: "name", type: "text", required: true },
		{ name: "description", type: "textarea" },
		{
			name: "type",
			type: "select",
			required: true,
			defaultValue: DiscountType.PERCENTAGE,
			options: [
				{ label: "Процентная", value: DiscountType.PERCENTAGE },
				{ label: "Фиксированная", value: DiscountType.FIXED },
				{ label: "По количеству", value: DiscountType.QUANTITY_BASED },
			],
		},
		{ name: "discountPercent", type: "number", min: 0, max: 100 },
		{ name: "fixedAmount", type: "number", min: 0 },
		{ name: "minTotalQuantity", type: "number", min: 1 },
		{ name: "minTotalAmount", type: "number", min: 0 },
		{ name: "appliesToAllProducts", type: "checkbox", defaultValue: true },
		{
			name: "applicableCategories",
			type: "relationship",
			relationTo: "categories",
			hasMany: true,
		},
		{
			name: "applicableProducts",
			type: "relationship",
			relationTo: "products",
			hasMany: true,
		},
		{ name: "isActive", type: "checkbox", defaultValue: true, index: true },
		{ name: "isUnlimited", type: "checkbox", defaultValue: false },
		{
			name: "startAt",
			type: "date",
			required: true,
			defaultValue: () => new Date().toISOString(),
		},
		{ name: "endAt", type: "date" },
		{
			name: "priority",
			type: "number",
			defaultValue: 1,
			min: 1,
			max: 10,
			index: true,
		},
		{
			name: "code",
			type: "text",
			unique: true,
			index: true,
			hooks: {
				beforeValidate: [
					({ value }) => (value ? String(value).trim().toUpperCase() : value),
				],
			},
		},
		{
			name: "totalUses",
			type: "number",
			defaultValue: 0,
			admin: { readOnly: true },
		},
		{
			name: "totalDiscountAmount",
			type: "number",
			defaultValue: 0,
			admin: { readOnly: true },
		},
		{
			name: "createdBy",
			type: "relationship",
			relationTo: "admins",
			admin: { readOnly: true },
		},
		{
			name: "updatedBy",
			type: "relationship",
			relationTo: "admins",
			admin: { readOnly: true },
		},
		{
			name: "isCurrentlyActive",
			type: "checkbox",
			virtual: true,
			admin: { readOnly: true },
			hooks: {
				afterRead: [
					({ data }) => {
						const now = new Date();
						if (!data?.isActive) return false;
						if (data.startAt && now < new Date(data.startAt)) return false;
						if (!data.isUnlimited && data.endAt && now > new Date(data.endAt))
							return false;
						return true;
					},
				],
			},
		},

		legacyIdField,
	],
	timestamps: true,
	// indexes: [
	//   { fields: { isActive: 1, startAt: 1, endAt: 1 } },
	//   { fields: { priority: 1, createdAt: -1 } },
	// ],
};
