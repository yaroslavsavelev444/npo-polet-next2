/**
 * Публичный контракт модуля промокодов.
 *
 * Наружу отдаются только чистые правила, типы и поле ввода. Server action и
 * работа с базой намеренно НЕ реэкспортируются: серверные модули импортируют
 * их по прямым путям, а клиентские компоненты — исключительно
 * `PromoCodeField`, который сам знает, к какому действию обращаться.
 */

export { PromoCodeField } from "./components/PromoCodeField";
export {
	formatRub,
	isValidPromoCodeFormat,
	normalizePromoCode,
	PROMO_CODE_MAX_LENGTH,
	PROMO_CODE_MIN_LENGTH,
	roundMoney,
} from "./lib/promo-code";
export type {
	CheckoutPricing,
	CheckoutPricingInput,
} from "./lib/promo-resolution";
export { resolveCheckoutPricing } from "./lib/promo-resolution";
export { evaluatePromoCode } from "./lib/promo-rules";
export type {
	PromoAcceptance,
	PromoApplyPreview,
	PromoApplyResult,
	PromoCartItem,
	PromoCodeRule,
	PromoDiscountType,
	PromoEvaluation,
	PromoEvaluationContext,
	PromoRejection,
	PromoRejectionReason,
} from "./types";
