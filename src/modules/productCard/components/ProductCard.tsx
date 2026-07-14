/**
 * modules/productCard/components/ProductCard.tsx
 *
 * Композиционный корень карточки. Не является ссылкой целиком — вложенные
 * интерактивные элементы (избранное, степпер, кнопка добавления) были бы
 * невалидны внутри <a>. Вместо этого заголовок оборачивается в Link со
 * "stretched link" приёмом (before:absolute before:inset-0), который
 * растягивает кликабельную область на всю карточку через ближайшего
 * позиционированного предка (сам article), а остальные интерактивные
 * элементы лежат поверх (z-10+) и остаются кликабельными независимо.
 */
import Link from "next/link";
import { calculatePriceBreakdown } from "../lib/pricing";
import { getProductHref } from "../lib/routing";
import type { ProductCardProps } from "../types";
import { ProductActions } from "./ProductActions";
import { ProductImage } from "./ProductImage";
import { ProductPrice } from "./ProductPrice";
import { ProductQuantitySelector } from "./ProductQuantitySelector";
import { ProductRating } from "./ProductRating";
import { ProductTitle } from "./ProductTitle";

export function ProductCard({
  product,
  currentCategorySlug,
  showQuickView = false,
  onQuickView,
  priorityImage = false,
  className,
}: ProductCardProps) {
  const { finalPrice, hasDiscount, discountPercentage } =
    calculatePriceBreakdown(product.priceForIndividual, product.discount);

  const href = getProductHref(product, currentCategorySlug);

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] transition-colors duration-200 hover:border-[var(--border-light)] ${className ?? ""}`}
    >
      <ProductActions
        product={product}
        showQuickView={showQuickView}
        onQuickView={onQuickView ? () => onQuickView(product) : undefined}
      />

      <ProductImage
        images={product.images}
        productId={product.id}
        hasDiscount={hasDiscount}
        discountPercentage={discountPercentage}
        status={product.status}
        priority={priorityImage}
      />

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <ProductRating rating={product.rating} reviewsCount={product.reviewsCount} />

        <ProductPrice
          finalPrice={finalPrice}
          originalPrice={product.priceForIndividual}
          hasDiscount={hasDiscount}
        />

        <Link
          href={href}
          className="block before:absolute before:inset-0 before:z-0 before:content-['']"
        >
          <ProductTitle title={product.title} />
        </Link>

        <div className="relative z-10 mt-auto pt-2">
          <ProductQuantitySelector
            product={product}
            minOrderQuantity={product.minOrderQuantity}
            maxOrderQuantity={product.maxOrderQuantity}
          />
        </div>
      </div>
    </article>
  );
}
