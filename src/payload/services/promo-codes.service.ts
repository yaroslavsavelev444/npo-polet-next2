import type { Category, Product, PromoCode } from "../../../payload-types";
import { normalizePromoCode } from "../../modules/promo/lib/promo-code.ts";
import type { PromoCodeRule } from "../../modules/promo/types.ts";
import { getPayloadInstance } from "./getPayload.ts";
import {
	attachRedemptionToOrder as attachToOrder,
	type ReservePromoCodeInput,
	reserveRedemption,
	revokeRedemptionById as revokeById,
	revokeRedemptionsForOrder as revokeForOrder,
} from "./promo-redemptions.db.ts";

export type { ReservePromoCodeInput };

function toNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

/** null вместо 0/NaN: «ограничения нет» и «ограничение равно нулю» — разные вещи. */
function toOptionalNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function toRelationIds(
	value: (number | Category)[] | (number | Product)[] | null | undefined,
): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) =>
		typeof item === "object" && item !== null ? String(item.id) : String(item),
	);
}

/**
 * Payload-документ → правило для чистого ядра.
 *
 * Граница между «данными в базе» и «логикой»: всё, что дальше по коду
 * считает скидку, работает с `PromoCodeRule` и потому тестируется литералом
 * без базы и без Payload.
 */
export function toPromoCodeRule(doc: PromoCode): PromoCodeRule {
	return {
		id: String(doc.id),
		code: doc.code,
		discountType: doc.discountType === "fixed" ? "fixed" : "percentage",
		discountPercent: toOptionalNumber(doc.discountPercent),
		maxDiscountAmount: toOptionalNumber(doc.maxDiscountAmount),
		fixedAmount: toOptionalNumber(doc.fixedAmount),
		minOrderAmount: toOptionalNumber(doc.minOrderAmount),
		startAt: doc.startAt ?? null,
		endAt: doc.endAt ?? null,
		isActive: doc.isActive !== false,
		maxUses: toOptionalNumber(doc.maxUses),
		maxUsesPerUser: toOptionalNumber(doc.maxUsesPerUser),
		appliesToAllProducts: doc.appliesToAllProducts !== false,
		applicableCategoryIds: toRelationIds(doc.applicableCategories),
		applicableProductIds: toRelationIds(doc.applicableProducts),
		combinable: doc.combinable === true,
		totalUses: toNumber(doc.totalUses),
	};
}

/**
 * Поиск промокода по коду.
 *
 * НАМЕРЕННО БЕЗ КЭША, в отличие от `getCachedDiscounts`. Промокод несёт
 * счётчик активаций, который меняется при каждом заказе: закэшированный
 * документ означал бы, что после исчерпания лимита код продолжает
 * применяться до истечения кэша.
 *
 * `overrideAccess: true` здесь безопасен и обязателен: коллекция закрыта на
 * чтение (см. PromoCodes.ts), а покупателю возвращается не документ, а
 * только результат применения уже известного ему кода.
 */
export async function findPromoCodeByCode(
	rawCode: string,
): Promise<PromoCode | null> {
	const code = normalizePromoCode(rawCode);
	if (code === "") return null;

	const payload = await getPayloadInstance();
	const { docs } = await payload.find({
		collection: "promo-codes",
		where: { code: { equals: code } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	return (docs[0] as unknown as PromoCode) ?? null;
}

/** Сколько раз пользователь уже применил этот код и не отменил заказ. */
export async function countUserRedemptions(
	promoCodeId: string,
	userId: string,
): Promise<number> {
	const payload = await getPayloadInstance();
	const { totalDocs } = await payload.find({
		collection: "promo-code-redemptions",
		where: {
			and: [
				{ promoCode: { equals: promoCodeId } },
				{ user: { equals: userId } },
				{ status: { equals: "applied" } },
			],
		},
		limit: 0,
		depth: 0,
		overrideAccess: true,
	});
	return totalDocs;
}

export interface PromoCodeLookup {
	rule: PromoCodeRule;
	userRedemptions: number;
}

/**
 * Всё, что нужно чистому ядру для оценки кода: само правило и личный счётчик
 * покупателя. Возвращает null, если такого кода нет.
 */
export async function loadPromoCodeLookup(
	rawCode: string,
	userId: string,
): Promise<PromoCodeLookup | null> {
	const doc = await findPromoCodeByCode(rawCode);
	if (!doc) return null;

	const rule = toPromoCodeRule(doc);
	const userRedemptions =
		rule.maxUsesPerUser === null
			? 0
			: await countUserRedemptions(rule.id, userId);

	return { rule, userRedemptions };
}

// ── Обёртки над операциями журнала активаций ────────────────────────────────
//
// Сама SQL-логика живёт в promo-redemptions.db.ts и принимает экземпляр
// Payload аргументом (там же объяснено, почему). Здесь — удобный фасад для
// серверных действий, у которых своего экземпляра нет.

export async function reservePromoCodeRedemption(
	input: ReservePromoCodeInput,
): Promise<string | null> {
	const payload = await getPayloadInstance();
	return reserveRedemption(payload, input);
}

export async function attachRedemptionToOrder(
	redemptionId: string,
	orderId: string,
): Promise<void> {
	const payload = await getPayloadInstance();
	return attachToOrder(payload, redemptionId, orderId);
}

export async function revokePromoCodeRedemptionById(
	redemptionId: string,
	reason: string,
): Promise<void> {
	const payload = await getPayloadInstance();
	return revokeById(payload, redemptionId, reason);
}

export async function revokePromoCodeRedemptionsForOrder(
	orderId: string,
	reason: string,
): Promise<number> {
	const payload = await getPayloadInstance();
	return revokeForOrder(payload, orderId, reason);
}
