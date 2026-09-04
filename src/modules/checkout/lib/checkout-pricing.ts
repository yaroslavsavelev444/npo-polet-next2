import type { CartView } from "@/modules/cart";
import { roundMoney } from "../../promo/lib/promo-code.ts";
import type {
	CheckoutPricing,
	CheckoutPricingInput,
} from "../../promo/lib/promo-resolution.ts";
import { resolveCheckoutPricing } from "../../promo/lib/promo-resolution.ts";
import type { PromoCartItem, PromoCodeRule } from "../../promo/types.ts";

/**
 * Мост между корзиной и модулем промокодов.
 *
 * Он живёт здесь, а не в `modules/promo`, сознательно: модуль промокодов не
 * должен знать ни о `CartView`, ни о коллекции `discounts`. Всё знание о том,
 * «какая величина корзины чему соответствует», собрано в одном этом файле —
 * значит, изменение витрины корзины не может тихо изменить математику скидки.
 *
 * Функция чистая: цены заказа считаются одинаково и на предпросмотре
 * («Применить»), и при создании заказа, потому что это буквально один и тот
 * же вызов.
 */

/** Позиции корзины в терминах промокода. */
export function toPromoCartItems(cart: CartView): PromoCartItem[] {
	return cart.items.map((item) => ({
		productId: item.product.id,
		categoryId: item.product.category?.id ?? null,
		// Именно subtotal: цена после товарной скидки, умноженная на
		// количество. Промокод не должен «доначислять» скидку на ту часть
		// цены, которую покупателю уже уступили на уровне товара.
		subtotal: item.subtotal,
		quantity: item.quantity,
	}));
}

/**
 * База корзинных скидок — сумма после товарных скидок.
 *
 * Выводится из тех же величин, что показаны покупателю в корзине, а не
 * пересчитывается заново: расхождение в копейку между «итого» в корзине и
 * базой скидки означало бы, что процент считается не от того, что человек
 * видел на экране.
 */
export function getPromoBaseAmount(cart: CartView): number {
	return roundMoney(
		cart.summary.priceWithoutDiscount - cart.summary.productDiscountAmount,
	);
}

/**
 * Итоговые цены заказа с учётом всех трёх уровней скидок.
 *
 * @param promo правило промокода и личный счётчик покупателя; null — код не вводили.
 */
export function calculateCheckoutPricing(
	cart: CartView,
	promo: { rule: PromoCodeRule; userRedemptions: number } | null,
	now: Date = new Date(),
): CheckoutPricing {
	const input: CheckoutPricingInput = {
		subtotal: cart.summary.priceWithoutDiscount,
		productDiscount: cart.summary.productDiscountAmount,
		baseAmount: getPromoBaseAmount(cart),
		items: toPromoCartItems(cart),
		centralDiscount: {
			amount: cart.summary.centralDiscountAmount,
			percent: cart.summary.centralDiscountPercent,
		},
		promo,
		now,
	};

	return resolveCheckoutPricing(input);
}
