import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { isLoggedIn } from "../access/isLoggedIn.ts";
import { legacyIdField } from "../fields/legacyId.ts";

// ─── Collection ───────────────────────────────────────────────────────────────

/**
 * Cart — корзина пользователя (one-to-one с User).
 *
 * Mongoose-аналог использовал:
 *  - CartSchema.statics.findByUser — заменяется запросом через Payload Local API
 *    или REST /api/carts?where[user][equals]=<id>&depth=2
 *  - virtual totalItems — вычисляется на клиенте / в серверном хелпере
 *  - pre('save') для updatedAt — Payload обновляет updatedAt автоматически
 */
export const Carts: CollectionConfig = {
	slug: "carts",

	admin: {
		useAsTitle: "id",
		defaultColumns: ["user", "updatedAt"],
		group: "Магазин",
		description: "Корзины пользователей (одна корзина на пользователя)",
	},

	access: {
		// Пользователь видит только свою корзину
		read: ({ req }) => {
			if (!req.user) return false;
			if (req.user.role === "admin" || req.user.role === "superadmin")
				return true;
			return { user: { equals: req.user.id } };
		},
		create: isLoggedIn,
		// Обновление — владелец корзины или админ
		update: ({ req }) => {
			if (!req.user) return false;
			if (req.user.role === "admin" || req.user.role === "superadmin")
				return true;
			return { user: { equals: req.user.id } };
		},
		delete: isAdminOrSuperAdmin,
	},

	fields: [
		// ── Владелец (уникален — один к одному) ──────────────────────────────────
		{
			name: "user",
			type: "relationship",
			relationTo: "users",
			required: true,
			unique: true,
			index: true,
			label: "Пользователь",
			admin: { position: "sidebar" },
		},

		// ── Позиции корзины ───────────────────────────────────────────────────────
		{
			name: "items",
			type: "array",
			label: "Позиции",
			fields: [
				{
					name: "product",
					type: "relationship",
					relationTo: "products",
					required: true,
					index: true,
					// depth: 1 вернёт нужные поля товара при depth=2 запросе
				},
				{
					name: "quantity",
					type: "number",
					required: true,
					min: 1,
					label: "Количество",
					admin: {
						description: "Минимум 1",
					},
				},
				{
					name: "addedAt",
					type: "date",
					defaultValue: () => new Date().toISOString(),
					label: "Добавлено",
					admin: { readOnly: true },
				},
			],
		},
		legacyIdField,
	],
};

// ─── Хелперы (Server-side) ────────────────────────────────────────────────────

/**
 * Аналог CartSchema.statics.findByUser.
 * Используй в Server Components / Route Handlers вместо прямого запроса.
 *
 * @example
 * const cart = await findCartByUser(payload, userId)
 */
export async function findCartByUser(payload: any, userId: string) {
	const { docs } = await payload.find({
		collection: "carts",
		where: { user: { equals: userId } },
		depth: 2, // populate items.product
		limit: 1,
	});
	return docs[0] ?? null;
}

/**
 * Аналог virtual totalItems.
 * Вычисляй на сервере после получения корзины.
 */
export function getTotalItems(cart: {
	items?: { quantity: number }[];
}): number {
	return (cart.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
}
