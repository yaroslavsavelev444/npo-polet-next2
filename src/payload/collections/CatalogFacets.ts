import type { CollectionConfig } from "payload";
import { isAdminOrSuperAdmin } from "../access/isAdminOrSuperAdmin.ts";
import { createRevalidateCacheHook } from "../hooks/revalidateCache.ts";

/**
 * Словарь фильтров каталога — необязательная ручная настройка фасетов раздела.
 *
 * Фасеты строятся автоматически из характеристик товаров раздела (см.
 * catalog-facets.service.ts): характеристика с одинаковым после нормализации
 * названием у нескольких товаров становится фильтром сама. Запись словаря
 * нужна только там, где автоматики мало:
 *
 *   • склеить разные названия одной характеристики («Масса» и «Вес») —
 *     поле «Другие написания»;
 *   • задать вид фильтра (список значений / диапазон) или скрыть его;
 *   • дать понятное название, единицу показа, раздел панели и порядок.
 *
 * Словарь — по разделу: у «Вес» в одном разделе и в другом могут быть разные
 * смыслы и единицы.
 */
export const CatalogFacets: CollectionConfig = {
	slug: "catalog-facets",
	labels: {
		singular: "Фильтр каталога",
		plural: "Фильтры каталога",
	},
	admin: {
		useAsTitle: "label",
		group: "Магазин",
		defaultColumns: ["label", "category", "display", "order"],
		description:
			"Фильтры раздела строятся из характеристик товаров автоматически. " +
			"Запись здесь нужна, чтобы объединить разные названия одной " +
			"характеристики, выбрать вид фильтра, скрыть его или задать порядок.",
	},
	access: {
		read: isAdminOrSuperAdmin,
		create: isAdminOrSuperAdmin,
		update: isAdminOrSuperAdmin,
		delete: isAdminOrSuperAdmin,
	},
	hooks: {
		afterChange: [createRevalidateCacheHook("catalog-facets")],
		afterDelete: [createRevalidateCacheHook("catalog-facets")],
	},
	fields: [
		{
			name: "category",
			type: "relationship",
			relationTo: "categories",
			required: true,
			index: true,
			label: "Раздел",
		},
		{
			name: "label",
			type: "text",
			required: true,
			label: "Характеристика",
			admin: {
				description:
					"Название так, как оно записано в характеристиках товаров. " +
					"Оно же — подпись фильтра на сайте.",
			},
		},
		{
			name: "aliases",
			type: "array",
			label: "Другие написания",
			admin: {
				description:
					"Названия той же характеристики у других товаров раздела " +
					"(например, «Вес» для «Масса»). Регистр, ё, пробелы и " +
					"единица в названии («Масса, кг») учитываются автоматически.",
			},
			fields: [{ name: "name", type: "text", required: true }],
		},
		{
			name: "display",
			type: "select",
			defaultValue: "auto",
			label: "Вид фильтра",
			options: [
				{ label: "Автоматически", value: "auto" },
				{ label: "Список значений", value: "list" },
				{ label: "Диапазон чисел", value: "range" },
				{ label: "Не показывать", value: "hidden" },
			],
		},
		{
			name: "unit",
			type: "text",
			label: "Единица показа",
			admin: {
				description:
					"Для числовых характеристик: в какой единице показывать " +
					"значения (например, «кВт»). Пусто — самая частая в разделе.",
			},
		},
		{
			name: "group",
			type: "text",
			label: "Раздел панели",
			admin: {
				description: "Пусто — группа характеристики из карточек товаров.",
			},
		},
		{
			name: "order",
			type: "number",
			defaultValue: 0,
			label: "Порядок",
			admin: { position: "sidebar" },
		},
	],
};
