import type { CollectionConfig } from "payload";
import { legacyIdField } from "../fields/legacyId.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

const PickupPoints: CollectionConfig = {
	slug: "pickup-points",
	admin: {
		useAsTitle: "name",
		group: "Доставка",
		defaultColumns: ["name", "city", "isActive"],
	},
	access: {
		read: () => true,
	},
	hooks: {
		afterChange: [createRevalidateCacheHook("pickup-points")],
		afterDelete: [createRevalidateCacheHook("pickup-points")],
	},
	fields: [
		{ name: "name", type: "text", required: true },
		{ name: "address", type: "text", required: true },
		{ name: "city", type: "text" },
		{ name: "phone", type: "text" },
		{ name: "workingHours", type: "text" },
		{
			name: "coordinates",
			type: "group",
			fields: [
				{ name: "lat", type: "number" },
				{ name: "lng", type: "number" },
			],
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

export default PickupPoints;
