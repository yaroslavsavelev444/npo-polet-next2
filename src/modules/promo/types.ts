/**
 * modules/promo — промокоды.
 *
 * Модуль намеренно САМОСТОЯТЕЛЕН и ничего не знает о коллекции `discounts`:
 * ни один тип отсюда не ссылается на `Discount`, ни одна функция не читает
 * центральные скидки. Промокод — отдельная сущность со своими правилами,
 * своим счётчиком активаций и своей таблицей погашений.
 *
 * Единственная точка, где две системы скидок встречаются, — это
 * `lib/promo-resolution.ts`: там задан порядок применения и разрешён
 * конфликт. Она принимает центральную скидку как ЧИСЛО (уже посчитанное
 * чужой системой), а не как документ, поэтому связь остаётся односторонней
 * и заменяемой.
 */

/** Тип скидки промокода. Хранится в БД как enum — расширяется без миграции данных. */
export type PromoDiscountType = "percentage" | "fixed";

/**
 * Промокод в том виде, в каком его понимает чистое ядро.
 *
 * Это НЕ Payload-документ: сервис приводит документ к этой форме
 * (`toPromoCodeRule`), и вся математика работает уже с ней. Благодаря этому
 * правила тестируются без базы, без Payload и без сети — достаточно
 * литерала.
 */
export interface PromoCodeRule {
	id: string;
	/** Код в каноническом виде — верхний регистр, без пробелов. */
	code: string;
	discountType: PromoDiscountType;
	/** Процент скидки (0–100). Значим только при discountType === "percentage". */
	discountPercent: number | null;
	/**
	 * Потолок скидки для процентных кодов: «−20%, но не более 5000 ₽».
	 * null — потолка нет.
	 */
	maxDiscountAmount: number | null;
	/** Сумма скидки. Значима только при discountType === "fixed". */
	fixedAmount: number | null;
	/** Минимальная сумма заказа, при которой код применим. null — без порога. */
	minOrderAmount: number | null;
	startAt: string | null;
	endAt: string | null;
	isActive: boolean;
	/** Максимум активаций всего. null — без ограничения. */
	maxUses: number | null;
	/** Максимум активаций одним пользователем. null — без ограничения. */
	maxUsesPerUser: number | null;
	/** Код действует на всю корзину, а не на подмножество товаров. */
	appliesToAllProducts: boolean;
	applicableCategoryIds: string[];
	applicableProductIds: string[];
	/**
	 * Можно ли сочетать с центральной скидкой.
	 *
	 * false — код и центральная скидка взаимоисключающи: применяется та, что
	 * выгоднее покупателю (см. promo-resolution).
	 * true  — код применяется ПОВЕРХ центральной скидки, последовательно.
	 */
	combinable: boolean;
	/** Сколько раз код уже активирован (непогашенные активации). */
	totalUses: number;
}

/** Позиция корзины в терминах промокода. */
export interface PromoCartItem {
	productId: string;
	/** Категория товара. У товара она одна — массива здесь нет намеренно. */
	categoryId: string | null;
	/**
	 * Сумма позиции, ОТ КОТОРОЙ считается скидка промокода: цена после
	 * товарных скидок, умноженная на количество.
	 */
	subtotal: number;
	quantity: number;
}

export interface PromoEvaluationContext {
	items: PromoCartItem[];
	/**
	 * Сумма заказа для проверки минимального порога.
	 *
	 * Всегда сумма ПОСЛЕ товарных скидок и ДО корзинных: порог — свойство
	 * заказа, который видит покупатель, а не остатка после других скидок.
	 * Иначе включение центральной скидки могло бы «уронить» заказ ниже порога
	 * и промокод переставал бы работать без всякой понятной причины.
	 */
	orderAmount: number;
	/** Сколько раз ЭТОТ пользователь уже активировал ЭТОТ код. */
	userRedemptions: number;
	now: Date;
}

/** Почему промокод не применён. Каждая причина имеет своё сообщение в UI. */
export type PromoRejectionReason =
	/** Кода нет в базе. */
	| "not_found"
	/** Код выключен администратором. */
	| "inactive"
	/** Срок действия ещё не начался. */
	| "not_started"
	/** Срок действия истёк. */
	| "expired"
	/** Исчерпан общий лимит активаций. */
	| "usage_limit_reached"
	/** Пользователь исчерпал свой лимит активаций. */
	| "user_limit_reached"
	/** Сумма заказа ниже минимальной. */
	| "min_order_amount"
	/** В корзине нет товаров, на которые распространяется код. */
	| "not_applicable_to_cart"
	/** Корзина пуста. */
	| "empty_cart"
	/** Код настроен так, что скидки не даёт (0% / 0 ₽). */
	| "misconfigured"
	/**
	 * Код валиден, но действующая скидка выгоднее, а сочетать их нельзя.
	 *
	 * Это НЕ ошибка пользователя, и молчать об этом нельзя: покупатель ввёл
	 * рабочий код и обязан узнать, почему итог не изменился.
	 */
	| "outweighed_by_discount";

export interface PromoRejection {
	applied: false;
	reason: PromoRejectionReason;
	/** Готовое сообщение для покупателя. */
	message: string;
	/**
	 * Сколько не хватает до минимальной суммы заказа. Есть только у
	 * reason === "min_order_amount" — UI показывает конкретную цифру.
	 */
	shortfall?: number;
}

export interface PromoAcceptance {
	applied: true;
	code: string;
	promoCodeId: string;
	discountType: PromoDiscountType;
	/** Сумма скидки промокода в рублях. */
	discountAmount: number;
	/**
	 * Сумма позиций, на которые распространяется код. Для кодов на всю
	 * корзину равна её сумме; для таргетированных — меньше.
	 */
	eligibleAmount: number;
	/** Процент — только для процентных кодов, иначе null. */
	discountPercent: number | null;
	/** Скидка упёрлась в потолок maxDiscountAmount. */
	cappedByMax: boolean;
	message: string;
}

export type PromoEvaluation = PromoAcceptance | PromoRejection;

// ── Контракт server action «Применить промокод» ──────────────────────────────

/**
 * Что покупатель увидит после успешного применения кода.
 *
 * Здесь ПОЛНЫЙ пересчёт итога, а не одна лишь сумма скидки: промокод может
 * вытеснить действующую скидку (combinable = false), и показать это,
 * не показав нового итога, значило бы оставить человека гадать, сколько он
 * в результате заплатит.
 */
export interface PromoApplyPreview {
	code: string;
	discountAmount: number;
	discountPercent: number | null;
	/** Центральная скидка после применения кода — 0, если код её вытеснил. */
	centralDiscountAmount: number;
	/** Код оказался выгоднее действующей скидки и заменил её. */
	centralDiscountSuppressed: boolean;
	totalDiscount: number;
	total: number;
	message: string;
}

export type PromoApplyResult =
	| { success: true; data: PromoApplyPreview }
	| {
			success: false;
			/** Машинная причина — UI выбирает по ней оформление и подсказку. */
			reason:
				| PromoRejectionReason
				| "auth_required"
				| "rate_limited"
				| "unknown";
			message: string;
			/** Сколько не хватает до минимальной суммы заказа, если причина в ней. */
			shortfall?: number;
	  };
