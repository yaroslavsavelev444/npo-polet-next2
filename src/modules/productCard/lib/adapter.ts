// modules/productCard/lib/adapter.ts
import type { Category, Media, Product } from "../../../../payload-types";
import type {
  ProductAvailabilityStatus,
  ProductCardCategory,
  ProductCardData,
  ProductCardImage,
} from "../types";

// ===== Вспомогательные функции (уже есть) =====
function isPopulatedMedia(value: number | Media | null | undefined): value is Media {
  return typeof value === "object" && value !== null;
}

function isPopulatedCategory(value: number | Category | null | undefined): value is Category {
  return typeof value === "object" && value !== null;
}

function mapImages(images: Product["images"]): ProductCardImage[] {
  if (!images || images.length === 0) return [];
  return images.filter(isPopulatedMedia).map((media) => ({
    url: media.url ?? "",
    alt: media.alt || "",
  }));
}

function mapCategory(category: Product["category"]): ProductCardCategory | null {
  if (!isPopulatedCategory(category)) return null;
  return {
    id: String(category.id),
    slug: category.slug ?? "",
    title: category.name,
  };
}

type RawInventoryStatus = NonNullable<Product["inventory"]>["status"];

function mapStatus(status: RawInventoryStatus): ProductAvailabilityStatus {
  switch (status) {
    case "available":
    case "preorder":
    case "out_of_stock":
    case "discontinued":
      return status;
    default:
      return "available";
  }
}

// Экспортируется: переиспользуется модулем поиска (src/modules/search)
// для расчёта цены со скидкой в выпадающих подсказках поиска — единая
// логика расчёта скидки на всём сайте.
export function mapDiscountPercentage(
  discount: Product["pricing"]["discount"],
  priceForIndividual: number,
): { isActive: boolean; percentage: number | null } {
  if (!discount?.isActive || !discount.value) {
    return { isActive: false, percentage: null };
  }
  if (discount.type === "fixed") {
    if (priceForIndividual <= 0) return { isActive: false, percentage: null };
    const percentage = (discount.value / priceForIndividual) * 100;
    return { isActive: true, percentage };
  }
  // type === 'percentage'
  return { isActive: true, percentage: Math.min(discount.value, 100) };
}

// ===== Основная функция =====
export function mapProductToCardData(product: Product): ProductCardData {
  const priceForIndividual = product.pricing?.priceForIndividual ?? 0;
  const discount = product.pricing?.discount;
  const discountInfo = mapDiscountPercentage(discount, priceForIndividual);

  const images = mapImages(product.images);
  const category = mapCategory(product.category);
  const status = mapStatus(product.inventory?.status);
  const minOrderQuantity = product.inventory?.minOrderQuantity ?? 1;
  const maxOrderQuantity = product.inventory?.maxOrderQuantity ?? 9999;

  return {
    id: product.id.toLocaleString(),
    title: product.title,
    slug: product.slug ?? '',
    description: product.description ?? '',
    images,
    category,
    priceForIndividual,
    discount: {
      isActive: discountInfo.isActive,
      percentage: discountInfo.percentage,
    },
    status,
    minOrderQuantity,
    maxOrderQuantity,
    brand: product.brand?.manufacturer ?? undefined,
    rating: 0,
    reviewsCount: 0,
  };
}