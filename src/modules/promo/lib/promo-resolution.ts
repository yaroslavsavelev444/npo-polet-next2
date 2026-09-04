import type {
	PromoCartItem,
	PromoCodeRule,
	PromoEvaluation,
	PromoRejection,
} from "../types.ts";
import { formatRub, roundMoney } from "./promo-code.ts";
import { evaluatePromoCode } from "./promo-rules.ts";

/**
 * ЕДИНСТВЕННОЕ место, где встречаются промокоды и остальные скидки.
 *
 * Всё остальное в модуле про другие скидки не знает вовсе (см. types.ts).
 * Здесь же зафиксирован порядок применения, и именно эта функция закрывает
 * требование «исключить конфликты между промокодами и другими скидками».
 *
 * ── Порядок применения ────────────────────────────────────────────────────
 *
 *   1. Скидка товара (`productDiscount`) — всегда и первой. Это свойство
 *      самого товара, а не корзины; обе корзинные скидки считаются уже от
 *      суммы после неё.
 *   2. Центральная скидка корзины (коллекция `discounts`) — приходит сюда
 *      готовым ЧИСЛОМ. Модуль промокодов не читает её документы и не знает
 *      её правил: связь односторонняя, и заменить одну систему на другую
 *      можно, не трогая ничего внутри promo.
 *   3. Промокод — по флагу `combinable` самого кода:
 *
 *      combinable = false (по умолчанию) — ВЗАИМОИСКЛЮЧЕНИЕ. Считаются оба
 *        варианта от одной базы, применяется выгодный покупателю. Ввод кода
 *        никогда не может ухудшить итог, а в заказе всегда ровно одна
 *        корзинная скидка.
 *
 *      combinable = true — ПОСЛЕДОВАТЕЛЬНОЕ сложение. Сначала центральная
 *        скидка, затем промокод считается от ОСТАТКА. Именно
 *        последовательно, а не «10 % + 95 % = 105 %»: сумма скидок при таком
 *        порядке не может превысить сумму заказа ни при какой настройке.
 *
 * Больше одного промокода на заказ не бывает — это следует из типа входа
 * (`promo` — один или ни одного), а не из проверки где-то в UI.
 */
export interface CheckoutPricingInput {
	/** Сумма товаров без каких-либо скидок. */
	subtotal: number;
	/** Скидки на уровне товаров — уже учтены в `baseAmount` и в позициях. */
	productDiscount: number;
	/**
	 * База корзинных скидок: сумма после товарных скидок.
	 * Приходит явно (из свободной от промокодов витрины корзины), а не
	 * выводится из позиций, чтобы округление совпадало с тем, что покупатель
	 * уже видел в корзине до копейки.
	 */
	baseAmount: number;
	/** Позиции с суммами после товарных скидок — нужны для адресных кодов. */
	items: PromoCartItem[];
	/** Центральная скидка корзины, посчитанная чужой системой. */
	centralDiscount: { amount: number; percent: number };
	/** Введённый промокод. null — покупатель код не вводил. */
	promo: { rule: PromoCodeRule; userRedemptions: number } | null;
	now: Date;
}

export interface CheckoutPricing {
	subtotal: number;
	productDiscount: number;
	centralDiscountAmount: number;
	centralDiscountPercent: number;
	promoDiscountAmount: number;
	/** Сумма всех скидок: товарных, центральной и промокода. */
	totalDiscount: number;
	total: number;
	/**
	 * Центральная скидка вытеснена промокодом (combinable = false и код
	 * оказался выгоднее). Заказ обязан записать её нулём, иначе снимок цен
	 * не сойдётся с итогом.
	 */
	centralDiscountSuppressed: boolean;
	/** Итог по промокоду. null — код не вводили. */
	promo: PromoEvaluation | null;
}

export function resolveCheckoutPricing(
	input: CheckoutPricingInput,
): CheckoutPricing {
	const { subtotal, productDiscount, baseAmount, items, promo, now } = input;

	// Центральная скидка не может быть больше базы: это защита от рассинхрона
	// с чужой системой, а не гипотетика — фиксированная скидка в 5000 ₽ на
	// корзину в 3000 ₽ иначе дала бы отрицательный итог.
	const central = clamp(input.centralDiscount.amount, baseAmount);
	const centralPercent = central > 0 ? input.centralDiscount.percent : 0;

	if (!promo) {
		return build({
			subtotal,
			productDiscount,
			baseAmount,
			centralAmount: central,
			centralPercent,
			promoAmount: 0,
			centralDiscountSuppressed: false,
			promoResult: null,
		});
	}

	const { rule, userRedemptions } = promo;

	if (rule.combinable) {
		return resolveCombinable({
			subtotal,
			productDiscount,
			baseAmount,
			items,
			central,
			centralPercent,
			rule,
			userRedemptions,
			now,
		});
	}

	return resolveExclusive({
		subtotal,
		productDiscount,
		baseAmount,
		items,
		central,
		centralPercent,
		rule,
		userRedemptions,
		now,
	});
}

/**
 * Взаимоисключение: обе скидки считаются от ОДНОЙ базы и сравниваются.
 *
 * Ничьи достаются промокоду. Покупатель совершил действие и обязан увидеть
 * его результат; сообщение «действующая скидка выгоднее» при равных суммах
 * было бы неправдой.
 */
function resolveExclusive(args: ResolveArgs): CheckoutPricing {
	const {
		subtotal,
		productDiscount,
		baseAmount,
		items,
		central,
		centralPercent,
		rule,
		userRedemptions,
		now,
	} = args;

	const evaluation = evaluatePromoCode(rule, {
		items,
		orderAmount: baseAmount,
		userRedemptions,
		now,
	});

	if (!evaluation.applied || evaluation.discountAmount < central) {
		// Код может быть безупречен и всё равно не примениться — тогда причина
		// подменяется на честную: дело не в коде, а в более выгодной скидке.
		const promoResult: PromoEvaluation = evaluation.applied
			? outweighed(central)
			: evaluation;

		return build({
			subtotal,
			productDiscount,
			baseAmount,
			centralAmount: central,
			centralPercent,
			promoAmount: 0,
			centralDiscountSuppressed: false,
			promoResult,
		});
	}

	return build({
		subtotal,
		productDiscount,
		baseAmount,
		centralAmount: 0,
		centralPercent: 0,
		promoAmount: evaluation.discountAmount,
		centralDiscountSuppressed: central > 0,
		promoResult: evaluation,
	});
}

/**
 * Последовательное сложение: промокод считается от остатка после
 * центральной скидки.
 *
 * Позиции масштабируются на ту же долю, на какую центральная скидка
 * уменьшила корзину. Это не приближение, а корректное распределение
 * корзинной скидки по позициям: она относится ко всей корзине, значит
 * каждая позиция несёт свою пропорциональную часть. Для кода на всю корзину
 * сумма отмасштабированных позиций в точности равна остатку.
 */
function resolveCombinable(args: ResolveArgs): CheckoutPricing {
	const {
		subtotal,
		productDiscount,
		baseAmount,
		items,
		central,
		centralPercent,
		rule,
		userRedemptions,
		now,
	} = args;

	const remaining = roundMoney(baseAmount - central);

	if (remaining <= 0) {
		// Центральная скидка уже покрыла заказ целиком — скидывать нечего.
		// Отдельная ветка нужна, чтобы покупатель не получил невнятное
		// «промокод не действует на товары в корзине» вместо настоящей причины.
		return build({
			subtotal,
			productDiscount,
			baseAmount,
			centralAmount: central,
			centralPercent,
			promoAmount: 0,
			centralDiscountSuppressed: false,
			promoResult: outweighed(central),
		});
	}

	const scale = baseAmount > 0 ? remaining / baseAmount : 0;
	const scaledItems = items.map((item) => ({
		...item,
		subtotal: roundMoney(item.subtotal * scale),
	}));

	const evaluation = evaluatePromoCode(rule, {
		items: scaledItems,
		// Порог минимальной суммы проверяется по сумме заказа ДО корзинных
		// скидок: иначе действующая акция могла бы «уронить» заказ ниже порога
		// и отключить промокод без всякой понятной покупателю причины.
		orderAmount: baseAmount,
		userRedemptions,
		now,
	});

	return build({
		subtotal,
		productDiscount,
		baseAmount,
		centralAmount: central,
		centralPercent,
		promoAmount: evaluation.applied ? evaluation.discountAmount : 0,
		centralDiscountSuppressed: false,
		promoResult: evaluation,
	});
}

interface ResolveArgs {
	subtotal: number;
	productDiscount: number;
	baseAmount: number;
	items: PromoCartItem[];
	central: number;
	centralPercent: number;
	rule: PromoCodeRule;
	userRedemptions: number;
	now: Date;
}

function outweighed(central: number): PromoRejection {
	return {
		applied: false,
		reason: "outweighed_by_discount",
		message: `Действующая скидка ${formatRub(central)} выгоднее — промокод не применён`,
	};
}

function build(args: {
	subtotal: number;
	productDiscount: number;
	baseAmount: number;
	centralAmount: number;
	centralPercent: number;
	promoAmount: number;
	centralDiscountSuppressed: boolean;
	promoResult: PromoEvaluation | null;
}): CheckoutPricing {
	const cartDiscount = clamp(
		args.centralAmount + args.promoAmount,
		args.baseAmount,
	);
	const total = roundMoney(args.baseAmount - cartDiscount);

	return {
		subtotal: roundMoney(args.subtotal),
		productDiscount: roundMoney(args.productDiscount),
		centralDiscountAmount: roundMoney(args.centralAmount),
		centralDiscountPercent: args.centralPercent,
		promoDiscountAmount: roundMoney(args.promoAmount),
		totalDiscount: roundMoney(args.productDiscount + cartDiscount),
		total,
		centralDiscountSuppressed: args.centralDiscountSuppressed,
		promo: args.promoResult,
	};
}

function clamp(value: number, max: number): number {
	if (!Number.isFinite(value) || value <= 0) return 0;
	return roundMoney(Math.min(value, max));
}
