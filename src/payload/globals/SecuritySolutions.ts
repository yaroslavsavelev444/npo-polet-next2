import type { GlobalConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

export const SecuritySolutions: GlobalConfig = {
	slug: "security-solutions",
	label: "Готовые решения для ЧОП",
	access: {
		read: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
	},
	hooks: {
		afterChange: [createRevalidateCacheHook("security-solutions")],
	},
	fields: [
		{
			name: "products",
			type: "relationship",
			relationTo: "products",
			hasMany: true,
			label: "Товары подборки",
			filterOptions: {
				_status: { equals: "published" },
				"inventory.isVisible": { equals: true },
			},
			admin: {
				allowCreate: false,
				isSortable: true,
				description:
					"Выберите товары из каталога. На сайте они появятся в порядке списка. Удаление из подборки не удаляет товар из каталога.",
			},
		},
	],
};
