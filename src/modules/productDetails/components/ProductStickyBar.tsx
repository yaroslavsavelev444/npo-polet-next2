"use client";

import type { ProductCardData } from "@/modules/productCard";
import { formatPrice } from "@/modules/productCard";
import { ProductQuantitySelector } from "@/modules/productCard/components/ProductQuantitySelector";
import type { ProductDetailData } from "../types";

interface Props {
	product: ProductDetailData;
	cardData: ProductCardData;
}

/**
 * Липкая панель покупки для мобильных. Держит цену и кнопку «в корзину» в
 * пределах досягаемости большого пальца при любой длине страницы — ключевой
 * mobile-паттерн e-commerce. На десктопе скрыта: там действия видны в шапке.
 * Переиспользует тот же ProductQuantitySelector, что и шапка (общий стор
 * корзины держит оба экземпляра синхронными).
 */
export function ProductStickyBar({ product, cardData }: Props) {
	return (
		<div className="fixed inset-x-0 bottom-0 z-[51] border-t border-[var(--border)] bg-[var(--surface)]/95 px-4 py-3 backdrop-blur-md lg:hidden">
			<div className="flex items-center gap-3">
				<div className="flex shrink-0 flex-col leading-tight">
					<span className="text-base font-bold text-[var(--text-primary)]">
						{formatPrice(product.finalPrice)}
					</span>
					{product.hasDiscount && (
						<span className="text-xs text-[var(--text-muted)] line-through">
							{formatPrice(product.priceForIndividual)}
						</span>
					)}
				</div>
				<div className="min-w-0 flex-1">
					<ProductQuantitySelector
						product={cardData}
						minOrderQuantity={product.minOrderQuantity}
						maxOrderQuantity={product.maxOrderQuantity}
					/>
				</div>
			</div>
		</div>
	);
}
