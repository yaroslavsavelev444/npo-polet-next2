/**
 * modules/productCard/types
 *
 * Типы модуля карточки товара.
 *
 * `ProductCardData` — нормализованная вью-модель карточки. Она НЕ совпадает
 * один в один с Payload-типом `Product`: часть полей (sku, rating, reviewsCount,
 * priceForWholesale и т.д.) в текущей схеме Payload ещё не существует.
 * Чтобы не размазывать риск "схема ещё не готова" по всем компонентам,
 * вся мапа Product -> ProductCardData живёт в одном месте — `lib/adapter.ts`.
 * Когда поля появятся в Payload, поменяется только адаптер.
 */

export type ProductAvailabilityStatus =
  | "available"
  | "preorder"
  | "out_of_stock"
  | "discontinued";

export interface ProductCardImage {
  url: string;
  alt: string;
}

export interface ProductCardDiscount {
  isActive: boolean;
  /** Итоговый процент скидки, уже посчитанный (0-100). */
  percentage: number | null;
}

export interface ProductCardCategory {
  id: string;
  slug: string;
  title?: string;
}

/**
 * Нормализованные данные, которых достаточно для рендера карточки товара.
 * Получаются через `mapProductToCardData` из `lib/adapter.ts`.
 */
export interface ProductCardData {
  id: string;
  title: string;
  slug: string;
  description?: string;
  images: ProductCardImage[];
  category: ProductCardCategory | null;

  priceForIndividual: number;
  discount: ProductCardDiscount;

  status: ProductAvailabilityStatus;
  minOrderQuantity: number;
  maxOrderQuantity: number;

  /** Производитель (brand.manufacturer). Уходит в Product JSON-LD как brand. */
  brand?: string;

  /**
   * TODO(payload-schema): рейтинг и количество отзывов сейчас не хранятся
   * в коллекции `products`. Будет агрегироваться из коллекции `reviews`
   * (см. README модуля). До тех пор — 0 по умолчанию.
   */
  rating: number;
  reviewsCount: number;
}

export interface ProductCardProps {
  product: ProductCardData;
  /**
   * Slug категории текущей страницы листинга — используется для построения
   * ссылки на товар без обращения к product.category, если страница уже
   * находится в контексте конкретной категории.
   */
  currentCategorySlug?: string;
  /** Показывать ли кнопку быстрого просмотра. */
  showQuickView?: boolean;
  onQuickView?: (product: ProductCardData) => void;
  /** Приоритетная загрузка изображения (для первых карточек above-the-fold). */
  priorityImage?: boolean;
  className?: string;
}

export interface ProductImageProps {
  images: ProductCardImage[];
  productId: string;
  hasDiscount: boolean;
  discountPercentage: number | null;
  status: ProductAvailabilityStatus;
  priority?: boolean;
}

export interface ProductActionsProps {
  showQuickView: boolean;
  onQuickView?: () => void;
}

export interface ProductPriceProps {
  finalPrice: number;
  originalPrice: number;
  hasDiscount: boolean;
}

export interface ProductRatingProps {
  rating: number;
  reviewsCount: number;
}

export interface ProductTitleProps {
  title: string;
}

export interface ProductStatusBadgeProps {
  status: ProductAvailabilityStatus;
}

export interface ProductQuantitySelectorProps {
  minOrderQuantity: number;
  maxOrderQuantity: number;
}
