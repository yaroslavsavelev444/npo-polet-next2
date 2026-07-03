import type { ProductCardData } from "@/modules/productCard";
import { mapProductToCardData } from "@/modules/productCard";
import { getCachedProducts } from "@/payload/services/products.service";

const RELATED_PRODUCTS_LIMIT = 8;

/**
 * Товары из той же категории, за исключением текущего.
 * Переиспользует уже существующий кэшированный сервис получения товаров.
 */
export async function getRelatedProducts(
  categoryId: string,
  excludeProductId: string,
): Promise<ProductCardData[]> {
  const { docs } = await getCachedProducts({
    category: categoryId,
    isVisible: true,
    limit: RELATED_PRODUCTS_LIMIT + 1,
    depth: 1,
  });

  return docs
    .filter((product) => String(product.id) !== String(excludeProductId))
    .slice(0, RELATED_PRODUCTS_LIMIT)
    .map(mapProductToCardData);
}
