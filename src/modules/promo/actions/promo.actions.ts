"use server";

import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { buildCartView } from "@/modules/cart/lib/build-cart-view";
import { calculateCheckoutPricing } from "@/modules/checkout/lib/checkout-pricing";
import { getCartByUserId } from "@/payload/services/carts.service";
import { loadPromoCodeLookup } from "@/payload/services/promo-codes.service";
import { isValidPromoCodeFormat, normalizePromoCode } from "../lib/promo-code";
import type { PromoApplyResult } from "../types";

/**
 * Единственный вход для кнопки «Применить».
 *
 * Действие ничего не сохраняет: оно ПРОВЕРЯЕТ код и возвращает предпросмотр
 * итога. Промокод нигде не «висит» в состоянии между шагами — ни в корзине,
 * ни в сессии. Это не упрощение, а осознанный выбор: сохранённый промокод
 * пришлось бы перепроверять при каждом изменении корзины и на каждом чтении
 * заказа, и любая пропущенная перепроверка означала бы заказ со скидкой по
 * коду, который к моменту оформления уже истёк. Здесь же источник правды
 * один — повторная проверка в момент создания заказа
 * (см. checkout.actions.ts).
 *
 * Сообщение о ненайденном коде намеренно совпадает с сообщением о выключенном
 * и неверно набранном: иначе ответы действия становятся оракулом, по которому
 * перебором отделяются существующие коды от несуществующих.
 */
export async function applyPromoCodeAction(
	rawCode: string,
): Promise<PromoApplyResult> {
	const user = await getCurrentUser();
	if (!user) {
		return {
			success: false,
			reason: "auth_required",
			message: "Войдите в аккаунт, чтобы применить промокод",
		};
	}

	const code = normalizePromoCode(String(rawCode ?? ""));

	// Заведомо невозможный код отсекается до базы и до счётчика попыток:
	// тратить на пустую строку попытку rate limit было бы наказанием за
	// случайное нажатие кнопки.
	if (!isValidPromoCodeFormat(code)) {
		return {
			success: false,
			reason: "not_found",
			message: "Промокод не найден или больше не действует",
		};
	}

	const rateLimit = await RATE_LIMITS.promoCode(String(user.id));
	if (!rateLimit.allowed) {
		return {
			success: false,
			reason: "rate_limited",
			message: "Слишком много попыток. Попробуйте через несколько минут",
		};
	}

	try {
		const [cartDoc, lookup] = await Promise.all([
			getCartByUserId(String(user.id)),
			loadPromoCodeLookup(code, String(user.id)),
		]);

		if (!lookup) {
			return {
				success: false,
				reason: "not_found",
				message: "Промокод не найден или больше не действует",
			};
		}

		const cart = await buildCartView(cartDoc);
		const pricing = calculateCheckoutPricing(cart, lookup);
		const promo = pricing.promo;

		// promo не может быть null: lookup передан явно. Проверка нужна
		// компилятору, а не рантайму.
		if (!promo || !promo.applied) {
			return {
				success: false,
				reason: promo?.reason ?? "unknown",
				message: promo?.message ?? "Промокод не удалось применить",
				...(promo && !promo.applied && promo.shortfall !== undefined
					? { shortfall: promo.shortfall }
					: {}),
			};
		}

		return {
			success: true,
			data: {
				code: promo.code,
				discountAmount: promo.discountAmount,
				discountPercent: promo.discountPercent,
				centralDiscountAmount: pricing.centralDiscountAmount,
				centralDiscountSuppressed: pricing.centralDiscountSuppressed,
				totalDiscount: pricing.totalDiscount,
				total: pricing.total,
				message: promo.message,
			},
		};
	} catch (error) {
		// Сбой базы не должен уносить в error boundary всю заполненную форму
		// оформления: промокод — необязательная часть заказа, и его отказ
		// обязан оставаться локальной ошибкой поля.
		console.error("[promo] apply failed:", error);
		return {
			success: false,
			reason: "unknown",
			message: "Не удалось проверить промокод. Попробуйте ещё раз",
		};
	}
}
