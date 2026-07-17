// src/modules/productCard/lib/routing.ts
/**
 * modules/productCard/lib/routing.ts
 *
 * Резолвинг ссылки на страницу товара.
 *
 * Схема URL:
 *   /category/[categorySlug]/products/[slug]
 *
 * Категория в пути берётся из САМОГО товара, а не из того, на какой странице
 * карточка сейчас показывается. Раньше приоритет был обратный
 * (currentCategorySlug > product.category.slug), из-за чего один товар получал
 * разные адреса в зависимости от контекста показа, а canonical на странице
 * строился из URL-параметра и указывал сам на себя — дубли не схлопывались,
 * а размножались. Единственный источник правды — категория, к которой товар
 * реально привязан в Payload.
 *
 * currentCategorySlug остаётся ТОЛЬКО запасным вариантом на случай, когда
 * product.category не подгружена (depth: 0) и настоящий slug знать неоткуда.
 */

import type { Category, Product } from "../../../../payload-types.ts";
import type { ProductCardData } from "../types/index.ts";

const FALLBACK_CATEGORY_SLUG = "all";

export function getProductHref(
	product: Pick<ProductCardData, "id" | "slug" | "category">,
	currentCategorySlug?: string,
): string {
	const categorySlug =
		product.category?.slug || currentCategorySlug || FALLBACK_CATEGORY_SLUG;

	// Товары, залитые до появления slug, могут его не иметь. Пока бэкофилл
	// (scripts/backfill-product-slugs.ts) не отработал, ссылка обязана остаться
	// рабочей: маршрут [slug] распознаёт числовой сегмент как legacy-id и делает
	// с него 301 на канонический адрес.
	const identifier = product.slug || product.id;

	return `/category/${categorySlug}/products/${identifier}`;
}

function isPopulatedCategory(
	value: number | Category | null | undefined,
): value is Category {
	return typeof value === "object" && value !== null;
}

/**
 * Ссылка на товар прямо из документа Payload — для серверного кода (хуки
 * коллекций, письма, уведомления), у которого на руках сырой `Product`, а не
 * `ProductCardData`.
 *
 * Нужен именно ради категории: без неё ссылка уходила бы на несуществующую
 * `/category/all/...` и гоняла получателя письма через лишний редирект.
 */
export function getProductHrefFromDoc(product: Product): string {
	const category = product.category;

	return getProductHref({
		id: String(product.id),
		slug: product.slug ?? "",
		category: isPopulatedCategory(category)
			? {
					id: String(category.id),
					slug: category.slug ?? "",
					title: category.name,
				}
			: null,
	});
}
