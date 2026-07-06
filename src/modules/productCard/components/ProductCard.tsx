/**
 * modules/productCard/components/ProductCard.tsx
 */
import { Card } from "@once-ui-system/core";
import { calculatePriceBreakdown } from "../lib/pricing";
import { getProductHref } from "../lib/routing";
import type { ProductCardProps } from "../types";
import { ProductActions } from "./ProductActions";
import { ProductImage } from "./ProductImage";
import { ProductPrice } from "./ProductPrice";
import { ProductQuantitySelector } from "./ProductQuantitySelector";
import { ProductRating } from "./ProductRating";
import { ProductStatusBadge } from "./ProductStatusBadge";
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

  const isOutOfStock = product.status === "out_of_stock";
  const href = getProductHref(product, currentCategorySlug);

  return (
    <Card
      href={href}
      direction="column"
      radius="m-4" // увеличенные закругления
      border={false} // убираем обводку
      background={"accent-medium"} // чуть другой фон (из theme.css)
      className={`
        group relative flex h-full flex-col overflow-hidden 
        transition-all duration-200 
        hover:-translate-y-1 hover:shadow-xl
        ${className ?? ""}
      `}
    >
      <ProductActions
        product={product}
        productId={product.id}
        showQuickView={showQuickView}
        onQuickView={onQuickView ? () => onQuickView(product) : undefined}
      />

      <ProductImage
        images={product.images}
        productId={product.id}
        hasDiscount={hasDiscount}
        discountPercentage={discountPercentage}
        priority={priorityImage}
      />

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        {product.status !== "available" && (
          <ProductStatusBadge status={product.status} />
        )}

        <div className="flex items-center justify-between gap-2">
          <ProductPrice
            finalPrice={finalPrice}
            originalPrice={product.priceForIndividual}
            hasDiscount={hasDiscount}
          />
          <ProductRating
            rating={product.rating}
            reviewsCount={product.reviewsCount}
          />
        </div>

        <ProductTitle title={product.title} />

        <div className="mt-auto pt-2">
          <ProductQuantitySelector
            product={product}
            productId={product.id}
            minOrderQuantity={product.minOrderQuantity}
            maxOrderQuantity={product.maxOrderQuantity}
            isOutOfStock={isOutOfStock}
          />
        </div>
      </div>
    </Card>
  );
}
