import type { ProductCardData } from "@/modules/productCard";
import { ProductPrice } from "@/modules/productCard/components/ProductPrice";
import { ProductQuantitySelector } from "@/modules/productCard/components/ProductQuantitySelector";
import { ProductStatusBadge } from "@/modules/productCard/components/ProductStatusBadge";
import { WishlistButton } from "@/modules/wishlist/components/WishlistButton";
import type { ProductDetailData } from "../types";

interface ProductHeaderProps {
  product: ProductDetailData;
  cardData: ProductCardData;
}

export function ProductHeader({ product, cardData }: ProductHeaderProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold leading-snug text-[var(--text-primary)] sm:text-3xl">
          {product.title}
        </h1>
        <div className="shrink-0">
          <WishlistButton product={cardData} />
        </div>
      </div>

      <ProductStatusBadge status={product.status} />

      <ProductPrice
        finalPrice={product.finalPrice}
        originalPrice={product.priceForIndividual}
        hasDiscount={product.hasDiscount}
      />

      {product.description && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
          {product.description}
        </p>
      )}

      <ProductQuantitySelector
        product={cardData}
        minOrderQuantity={product.minOrderQuantity}
        maxOrderQuantity={product.maxOrderQuantity}
      />
    </div>
  );
}
