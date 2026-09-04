import type {
	PromoCartItem,
	PromoCodeRule,
	PromoEvaluation,
	PromoEvaluationContext,
	PromoRejection,
} from "../types.ts";
import { formatRub, roundMoney } from "./promo-code.ts";

/**
 * Единственное место, где решается «применим ли этот промокод к этой
 * корзине».
 *
 * Функция чистая: ни базы, ни Payload, ни времени из окружения (`now`
 * приходит аргументом). Поэтому весь набор отказов — истёкший срок,
 * исчерпанный лимит, недобранная сумма — проверяется в тестах литералами, а
 * не подготовкой данных в базе. Ровно этого требует «логика применения
 * промокода изолирована и легко тестируема».
 *
 * ── Порядок проверок ──────────────────────────────────────────────────────
 * Он зафиксирован и покрыт тестами, потому что от него зависит, КАКОЕ из
 * нескольких верных сообщений увидит покупатель. Правило простое: сначала
 * то, что пользователь не может исправить, и лишь потом — то, что может.
 *
 *   1. Пустая корзина        — говорить о скидке не о чем.
 *   2. Код выключен/просрочен/исчерпан — код мёртв, корзина ни при чём.
 *   3. Личный лимит          — код жив, но не для этого покупателя.
 *   4. Нет подходящих товаров — код к этой корзине неприменим в принципе.
 *   5. Минимальная сумма     — единственный отказ, который исправляется
 *                              добавлением товаров; поэтому он последний и
 *                              несёт конкретную цифру нехватки.
 *
 * Поменяй порядок 4 и 5 — и покупателю с корзиной из «не тех» товаров
 * предлагалось бы «добавить ещё на 500 ₽», после чего код всё равно не
 * сработал бы. Это была бы ложная подсказка.
 */
export function evaluatePromoCode(
	rule: PromoCodeRule,
	context: PromoEvaluationContext,
): PromoEvaluation {
	const { items, orderAmount, userRedemptions, now } = context;

	if (items.length === 0 || orderAmount <= 0) {
		return reject("empty_cart", "Добавьте товары в корзину");
	}

	if (!rule.isActive) {
		return reject("inactive", "Промокод не найден или больше не действует");
	}

	if (rule.startAt && now < new Date(rule.startAt)) {
		return reject("not_started", "Промокод ещё не начал действовать");
	}

	if (rule.endAt && now > new Date(rule.endAt)) {
		return reject("expired", "Срок действия промокода истёк");
	}

	if (rule.maxUses !== null && rule.totalUses >= rule.maxUses) {
		return reject(
			"usage_limit_reached",
			"Промокод исчерпал лимит использований",
		);
	}

	if (rule.maxUsesPerUser !== null && userRedemptions >= rule.maxUsesPerUser) {
		return reject(
			"user_limit_reached",
			rule.maxUsesPerUser === 1
				? "Вы уже использовали этот промокод"
				: `Вы уже использовали этот промокод ${rule.maxUsesPerUser} раз(а)`,
		);
	}

	const eligibleAmount = roundMoney(sumEligible(rule, items));

	if (eligibleAmount <= 0) {
		return reject(
			"not_applicable_to_cart",
			"Промокод не действует на товары в корзине",
		);
	}

	if (rule.minOrderAmount !== null && orderAmount < rule.minOrderAmount) {
		const shortfall = roundMoney(rule.minOrderAmount - orderAmount);
		return {
			applied: false,
			reason: "min_order_amount",
			message: `Промокод действует от ${formatRub(rule.minOrderAmount)} — добавьте товаров ещё на ${formatRub(shortfall)}`,
			shortfall,
		};
	}

	return calculateDiscount(rule, eligibleAmount);
}

/**
 * Сумма позиций, на которые распространяется код.
 *
 * Товар подходит, если он назван явно ИЛИ входит в одну из названных
 * категорий. Списки складываются, а не пересекаются: администратор,
 * выбравший категорию «Крепёж» и вдобавок один товар из другой категории,
 * ожидает акцию на то и другое, а не пустое пересечение.
 */
function sumEligible(rule: PromoCodeRule, items: PromoCartItem[]): number {
	if (rule.appliesToAllProducts) {
		return items.reduce((sum, item) => sum + item.subtotal, 0);
	}

	const productIds = new Set(rule.applicableProductIds);
	const categoryIds = new Set(rule.applicableCategoryIds);

	return items.reduce((sum, item) => {
		const matches =
			productIds.has(item.productId) ||
			(item.categoryId !== null && categoryIds.has(item.categoryId));
		return matches ? sum + item.subtotal : sum;
	}, 0);
}

/**
 * Расчёт суммы скидки по типу кода.
 *
 * Оба типа ограничены сверху суммой подходящих позиций: скидка не может
 * превратить заказ в отрицательный, а фиксированный код на 5000 ₽ в корзине
 * на 3000 ₽ обязан дать ровно 3000 ₽, а не долг магазина покупателю.
 */
function calculateDiscount(
	rule: PromoCodeRule,
	eligibleAmount: number,
): PromoEvaluation {
	if (rule.discountType === "fixed") {
		const fixedAmount = rule.fixedAmount ?? 0;
		if (fixedAmount <= 0) return misconfigured();

		const discountAmount = roundMoney(Math.min(fixedAmount, eligibleAmount));
		return {
			applied: true,
			code: rule.code,
			promoCodeId: rule.id,
			discountType: "fixed",
			discountAmount,
			eligibleAmount,
			discountPercent: null,
			cappedByMax: false,
			message: `Промокод применён — скидка ${formatRub(discountAmount)}`,
		};
	}

	const discountPercent = rule.discountPercent ?? 0;
	if (discountPercent <= 0) return misconfigured();

	const raw = roundMoney(eligibleAmount * (discountPercent / 100));
	// Потолок применяется ДО ограничения суммой корзины: «−20%, но не более
	// 5000 ₽» — это обещание магазина, а не следствие размера заказа.
	const capped =
		rule.maxDiscountAmount !== null && raw > rule.maxDiscountAmount;
	const discountAmount = roundMoney(
		Math.min(capped ? (rule.maxDiscountAmount as number) : raw, eligibleAmount),
	);

	if (discountAmount <= 0) return misconfigured();

	return {
		applied: true,
		code: rule.code,
		promoCodeId: rule.id,
		discountType: "percentage",
		discountAmount,
		eligibleAmount,
		discountPercent,
		cappedByMax: capped,
		message: capped
			? `Промокод применён — скидка ${discountPercent}%, но не более ${formatRub(discountAmount)}`
			: `Промокод применён — скидка ${discountPercent}%`,
	};
}

function reject(
	reason: PromoRejection["reason"],
	message: string,
): PromoRejection {
	return { applied: false, reason, message };
}

/**
 * Код, настроенный так, что скидки не даёт (0 % или 0 ₽).
 *
 * Покупателю про ошибку конфигурации не сообщается: для него это
 * неработающий код, и подробности настройки — не его забота.
 */
function misconfigured(): PromoRejection {
	return {
		applied: false,
		reason: "misconfigured",
		message: "Промокод не найден или больше не действует",
	};
}
