// src/payload/hooks/normalizeProductForCatalog.ts
import type { CollectionBeforeChangeHook } from "payload";
import {
	manufacturerKey,
	normalizeSpec,
} from "../../modules/productCatalog/lib/specNormalization.ts";
import { readProductRating } from "../services/product-rating.db.ts";

type SpecRow = {
	name?: string | null;
	value?: string | null;
	unit?: string | null;
	[key: string]: unknown;
};

/**
 * Служебные поля товара для фасетов и сортировки каталога — вычисляются
 * здесь при каждом сохранении, в админке их не видно и руками не правят:
 *
 *   • specifications[].nameKey/valueKey/valueNum/unitKey — нормализованные
 *     ключи характеристики (см. specNormalization.ts);
 *   • brand.manufacturerKey — ключ производителя;
 *   • analytics.ratingAverage/reviewsCount — агрегат одобренных отзывов
 *     (см. product-rating.db.ts: почему пересчёт нужен и здесь).
 *
 * Ключи пересчитываются, только если в данных пришли сами характеристики или
 * производитель: частичное обновление (payload.update с одним полем) оставляет
 * уже сохранённые ключи как есть.
 */
export const normalizeProductForCatalog: CollectionBeforeChangeHook = async ({
	data,
	originalDoc,
	operation,
	req,
}) => {
	if (Array.isArray(data.specifications)) {
		data.specifications = (data.specifications as SpecRow[]).map((row) => ({
			...row,
			...normalizeSpec(row),
		}));
	}

	if (data.brand && "manufacturer" in data.brand) {
		data.brand = {
			...data.brand,
			manufacturerKey: manufacturerKey(data.brand.manufacturer),
		};
	}

	const productId = operation === "update" ? Number(originalDoc?.id) : null;
	const rating = productId
		? await readProductRating(req.payload, productId, req)
		: { ratingAverage: null, reviewsCount: 0 };
	data.analytics = { ...(data.analytics ?? {}), ...rating };

	return data;
};
