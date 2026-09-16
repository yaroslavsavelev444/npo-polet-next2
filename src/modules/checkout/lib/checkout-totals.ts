import type { CartView } from "../../cart/types/index.ts";
import { roundMoney } from "../../promo/lib/promo-code.ts";
import type { PromoApplyPreview } from "../../promo/types.ts";

/**
 * Разбор итоговой суммы заказа для показа покупателю.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗДЕСЬ НЕ СЧИТАЮТ ДЕНЬГИ
 * ────────────────────────────────────────────────────────────────────────────
 * Все величины уже посчитаны — витриной корзины (товарные и корзинная скидки)
 * и сервером при проверке промокода (`applyPromoCodeAction`, тот же расчёт,
 * что применяется к заказу). Эта функция только РАСКЛАДЫВАЕТ готовый итог на
 * слагаемые, чтобы покупатель видел, откуда взялась сумма.
 *
 * Единственная арифметика — вычитания уже известных чисел друг из друга. Ни
 * процентов, ни правил применения скидок здесь нет и быть не должно: вторая
 * реализация порядка скидок рядом с `promo-resolution` разошлась бы с
 * серверной незаметно, и покупателю показали бы не ту цену, которую он
 * заплатит.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ИТОГ СКИДКИ СЧИТАЕТСЯ ОТ ИТОГА, А НЕ СЛОЖЕНИЕМ СЛАГАЕМЫХ
 * ────────────────────────────────────────────────────────────────────────────
 * `subtotal − total` — величина, в которой невозможно ошибиться: оба числа
 * пришли из расчёта, который и создаст заказ. Сумма же трёх слагаемых может
 * с ней разойтись в единственном случае — когда скидки упёрлись в сумму
 * корзины и `resolveCheckoutPricing` их ограничил (clamp). Расхождение не
 * маскируется: `breakdownIsExact` становится false, и интерфейс показывает
 * одну честную строку «Скидка» вместо разбора, который не сходится.
 */

/** Скидка корзины: одна строка разбора. */
export interface CheckoutDiscountLine {
	/** Ключ строки — он же смысл скидки, а не просто id для React. */
	kind: "product" | "central" | "promo";
	label: string;
	/** Величина уступки в рублях, всегда положительная. */
	amount: number;
	/** Процент, если он у скидки есть и его знает витрина. */
	percent: number | null;
	/** Код промокода — только у строки промокода. */
	code?: string;
}

export interface CheckoutTotals {
	/** Штук товара — сумма количеств по позициям. */
	itemsQuantity: number;
	/** Наименований в заказе. */
	positions: number;
	/** Стоимость товаров до каких-либо скидок. */
	subtotal: number;
	/** Разбор скидок сверху вниз: товарная → корзинная → промокод. */
	discounts: CheckoutDiscountLine[];
	/**
	 * Вся уступка целиком: `subtotal − total`. Показывается вместо разбора,
	 * когда разбор не сходится с итогом.
	 */
	totalDiscount: number;
	/** Сумма слагаемых разбора сходится с `totalDiscount` до копейки. */
	breakdownIsExact: boolean;
	/** К оплате. */
	total: number;
	/** Промокод применён — итог уже включает его скидку. */
	promoApplied: boolean;
	/**
	 * Промокод вытеснил действующую скидку корзины (они несовместимы, код
	 * оказался выгоднее). Покупатель видел ту скидку в корзине и обязан
	 * узнать, куда она делась.
	 */
	centralDiscountSuppressed: boolean;
}

/**
 * Название акции уже содержит её процент («Оптовая скидка 5%»).
 *
 * Проверка идёт по границе числа, а не по вхождению подстроки: иначе «5%»
 * находилось бы внутри «15%» и значок скидки пропадал бы у акции, название
 * которой её процента не называет.
 */
function labelMentionsPercent(label: string, percent: number): boolean {
	return new RegExp(`(^|\\D)${percent}\\s*%`).test(label);
}

/**
 * @param cart витрина корзины — источник товарных и корзинной скидок.
 * @param promo предпросмотр применённого промокода с сервера; null — кода нет.
 */
export function buildCheckoutTotals(
	cart: CartView,
	promo: PromoApplyPreview | null,
): CheckoutTotals {
	const subtotal = roundMoney(cart.summary.priceWithoutDiscount);

	// Итог берётся ЦЕЛИКОМ из одного источника: либо предпросмотр промокода
	// (он пересчитал корзину вместе с кодом), либо витрина корзины. Смешивать
	// их — складывать итог корзины со скидкой кода — значило бы завести третий
	// расчёт цены рядом с двумя существующими.
	const total = roundMoney(promo ? promo.total : cart.summary.totalPrice);

	// Товарная скидка промокодом не затрагивается никогда: код считается от
	// суммы ПОСЛЕ неё (см. promo-resolution).
	const productDiscount = roundMoney(cart.summary.productDiscountAmount);

	// Корзинную скидку промокод вытеснить может — тогда предпросмотр вернёт
	// ноль, и строки в разборе не будет.
	const centralDiscount = roundMoney(
		promo ? promo.centralDiscountAmount : cart.summary.centralDiscountAmount,
	);
	const promoDiscount = promo ? roundMoney(promo.discountAmount) : 0;

	const discounts: CheckoutDiscountLine[] = [];

	if (productDiscount > 0) {
		discounts.push({
			kind: "product",
			label: "Скидка на товары",
			amount: productDiscount,
			percent: null,
		});
	}

	if (centralDiscount > 0) {
		// Имя акции — из самой корзины: покупатель видел его там же.
		const label = cart.discounts.applied[0]?.name?.trim() || "Скидка на заказ";
		const percent =
			cart.summary.centralDiscountPercent > 0
				? cart.summary.centralDiscountPercent
				: null;

		discounts.push({
			kind: "central",
			label,
			amount: centralDiscount,
			// Акции почти всегда названы процентом («Оптовая скидка 5%»), и
			// значок «−5%» рядом с таким именем — это одно и то же число дважды
			// в одной строке. Показываем процент отдельно, только если из имени
			// его не узнать.
			percent:
				percent !== null && labelMentionsPercent(label, percent)
					? null
					: percent,
		});
	}

	if (promo && promoDiscount > 0) {
		discounts.push({
			kind: "promo",
			label: "Промокод",
			amount: promoDiscount,
			percent: promo.discountPercent,
			code: promo.code,
		});
	}

	const totalDiscount = roundMoney(subtotal - total);
	const breakdownSum = roundMoney(
		discounts.reduce((sum, line) => sum + line.amount, 0),
	);

	return {
		itemsQuantity: cart.summary.totalItems,
		positions: cart.items.length,
		subtotal,
		discounts,
		totalDiscount,
		// Полкопейки допуска: суммы уже округлены до копеек, и точное равенство
		// здесь безопасно, но сравнение чисел с плавающей точкой «на глаз» —
		// нет.
		breakdownIsExact: Math.abs(breakdownSum - totalDiscount) < 0.005,
		total,
		promoApplied: Boolean(promo),
		centralDiscountSuppressed: Boolean(promo?.centralDiscountSuppressed),
	};
}
