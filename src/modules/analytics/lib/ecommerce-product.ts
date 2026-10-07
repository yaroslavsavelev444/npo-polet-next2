/**
 * Товар в формате электронной коммерции Яндекс.Метрики. Отдельно от
 * ../ecommerce.ts, потому что нужен и серверу (состав покупки собирает
 * submitOrderAction), а тот модуль тянет за собой клиентский стор согласия.
 */
import type { ProductCardData } from "@/modules/productCard";
import { calculatePriceBreakdown } from "@/modules/productCard/lib/pricing";

export interface EcommerceProduct {
	id: string;
	name?: string;
	/** Цена за единицу после скидок товара, в рублях. */
	price?: number;
	brand?: string;
	category?: string;
	quantity?: number;
}

export interface EcommercePurchase {
	/** Номер заказа — по нему Метрика склеивает повторы одной покупки. */
	id: string;
	revenue: number;
	coupon?: string;
	products: EcommerceProduct[];
}

/** Товар из карточки. Цена — витринная, со скидкой товара. */
export function toEcommerceProduct(
	product: ProductCardData,
	quantity?: number,
): EcommerceProduct {
	return {
		id: product.id,
		name: product.title,
		price: calculatePriceBreakdown(product.priceForIndividual, product.discount)
			.finalPrice,
		brand: product.brand || undefined,
		category: product.category?.title || undefined,
		quantity,
	};
}
