/**
 * modules/productCard/lib/routing.ts
 *
 * Резолвинг ссылки на страницу товара.
 *
 * Решение по архитектуре (зафиксировано с пользователем):
 *   /categories/[categorySlug]/products/[id]
 *
 * Используем id товара (не slug/sku), т.к. слага/sku ещё нет в схеме Payload.
 * Приоритет источника categorySlug, как и в старом проекте:
 *   1. currentCategorySlug (страница уже внутри категории — листинг каталога)
 *   2. product.category.slug (карточка показывается вне контекста категории,
 *      например в блоке "похожие товары")
 */

import type { ProductCardData } from "../types";

const FALLBACK_CATEGORY_SLUG = "all";

export function getProductHref(
  product: Pick<ProductCardData, "id" | "category">,
  currentCategorySlug?: string,
): string {
  const categorySlug =
    currentCategorySlug || product.category?.slug || FALLBACK_CATEGORY_SLUG;

  return `/categories/${categorySlug}/products/${product.id}`;
}
