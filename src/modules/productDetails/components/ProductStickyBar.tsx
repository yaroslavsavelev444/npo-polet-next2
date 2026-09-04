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
 * mobile-паттерн e-commerce. На десктопе скрыта: там действия видны в липком
 * блоке покупки.
 *
 * Степпера здесь нет намеренно. На 390 px в строку не помещались цена в шесть
 * разрядов, степпер и кнопка разом: цена обрезалась на середине, а кнопка
 * сжималась. Панель — короткий путь «добавить», точное количество задаётся
 * степпером в блоке покупки выше и в корзине. Оба экземпляра используют один
 * стор корзины и остаются синхронными.
 */
export function ProductStickyBar({ product, cardData }: Props) {
	return (
		<div className="fixed inset-x-0 bottom-0 z-[51] border-t border-[var(--hairline)] bg-[var(--surface)]/95 px-[1rem] pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-md lg:hidden">
			<div className="flex items-center gap-4">
				<div className="flex min-w-0 shrink flex-col leading-tight">
					<span className="truncate text-[17px] font-bold tabular-nums text-[var(--text-primary)]">
						{formatPrice(product.finalPrice)}
					</span>
					{product.hasDiscount && (
						<span className="truncate text-xs tabular-nums text-[var(--text-muted)] line-through">
							{formatPrice(product.priceForIndividual)}
						</span>
					)}
				</div>

				<div className="min-w-0 flex-1">
					<ProductQuantitySelector
						variant="card"
						product={cardData}
						minOrderQuantity={product.minOrderQuantity}
						maxOrderQuantity={product.maxOrderQuantity}
					/>
				</div>
			</div>
		</div>
	);
}
