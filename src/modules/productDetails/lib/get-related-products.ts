import type { ProductCardData } from "@/modules/productCard";
import { mapProductToCardData } from "@/modules/productCard";
import { getCachedProducts } from "@/payload/services/products.service";
import type { Product } from "@/payload-types";

const RELATED_PRODUCTS_LIMIT = 8;

export async function getRelatedProducts(
  categoryId: string,
  excludeProductId: string,
  upsellIds: string[] = [],
): Promise<ProductCardData[]> {
  if (upsellIds.length > 0) {
    const { docs } = await getCachedProducts({
      ids: upsellIds,
      isVisible: true,
      limit: RELATED_PRODUCTS_LIMIT,
    });
    const productMap = new Map(docs.map((p) => [String(p.id), p]));
    return upsellIds
      .map((id) => productMap.get(id))
      .filter((p): p is Product => Boolean(p))
      .map(mapProductToCardData);
  }

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
