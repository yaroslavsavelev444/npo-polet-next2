import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckoutPricingInput } from "../../src/modules/promo/lib/promo-resolution.ts";
import { resolveCheckoutPricing } from "../../src/modules/promo/lib/promo-resolution.ts";
import type {
	PromoCartItem,
	PromoCodeRule,
} from "../../src/modules/promo/types.ts";

/**
 * Взаимодействие промокодов с остальными скидками.
 *
 * Это главный тест модуля: именно здесь проверяется, что конфликт двух систем
 * скидок разрешён однозначно и что итог заказа при любой комбинации сходится
 * с суммой скидок. Порядок применения зафиксирован в promo-resolution.ts:
 * товарная скидка → центральная скидка → промокод (заменой или сложением).
 *
 * Запуск: pnpm test:promo
 */

const NOW = new Date("2026-06-15T12:00:00.000Z");

function rule(overrides: Partial<PromoCodeRule> = {}): PromoCodeRule {
	return {
		id: "1",
		code: "PROMO",
		discountType: "percentage",
		discountPercent: 10,
		maxDiscountAmount: null,
		fixedAmount: null,
		minOrderAmount: null,
		startAt: "2026-01-01T00:00:00.000Z",
		endAt: null,
		isActive: true,
		maxUses: null,
		maxUsesPerUser: null,
		appliesToAllProducts: true,
		applicableCategoryIds: [],
		applicableProductIds: [],
		combinable: false,
		totalUses: 0,
		...overrides,
	};
}

/**
 * Корзина «10 000 ₽ после товарных скидок»: товаров на 12 000 ₽, из которых
 * 2 000 ₽ уступлено на уровне самих товаров.
 */
function input(
	overrides: Partial<CheckoutPricingInput> = {},
): CheckoutPricingInput {
	const items: PromoCartItem[] = overrides.items ?? [
		{ productId: "p1", categoryId: "c1", subtotal: 10000, quantity: 1 },
	];
	return {
		subtotal: 12000,
		productDiscount: 2000,
		baseAmount: items.reduce((s, i) => s + i.subtotal, 0),
		items,
		centralDiscount: { amount: 0, percent: 0 },
		promo: null,
		now: NOW,
		...overrides,
	};
}

/** Итог обязан сходиться со скидками при ЛЮБОЙ комбинации — общий инвариант. */
function assertConsistent(
	pricing: ReturnType<typeof resolveCheckoutPricing>,
	baseAmount: number,
) {
	assert.equal(
		pricing.total,
		Math.round(
			(baseAmount -
				pricing.centralDiscountAmount -
				pricing.promoDiscountAmount) *
				100,
		) / 100,
		"итог не сходится с применёнными корзинными скидками",
	);
	assert.equal(
		pricing.totalDiscount,
		Math.round(
			(pricing.productDiscount +
				pricing.centralDiscountAmount +
				pricing.promoDiscountAmount) *
				100,
		) / 100,
		"сумма скидок не сходится со слагаемыми",
	);
	assert.ok(pricing.total >= 0, "итог заказа не может быть отрицательным");
}

// ── Без промокода ───────────────────────────────────────────────────────────

test("без промокода центральная скидка применяется как прежде", () => {
	const pricing = resolveCheckoutPricing(
		input({ centralDiscount: { amount: 500, percent: 5 } }),
	);

	assert.equal(pricing.promo, null);
	assert.equal(pricing.centralDiscountAmount, 500);
	assert.equal(pricing.promoDiscountAmount, 0);
	assert.equal(pricing.total, 9500);
	assert.equal(pricing.totalDiscount, 2500);
	assertConsistent(pricing, 10000);
});

test("центральная скидка больше суммы корзины обрезается по ней", () => {
	// Защита от рассинхрона с чужой системой скидок: фиксированная скидка,
	// превышающая корзину, иначе дала бы отрицательный итог.
	const pricing = resolveCheckoutPricing(
		input({ centralDiscount: { amount: 50000, percent: 0 } }),
	);

	assert.equal(pricing.centralDiscountAmount, 10000);
	assert.equal(pricing.total, 0);
	assertConsistent(pricing, 10000);
});

// ── Взаимоисключение (combinable = false) ───────────────────────────────────

test("промокод выгоднее центральной скидки — вытесняет её", () => {
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 500, percent: 5 },
			promo: { rule: rule({ discountPercent: 20 }), userRedemptions: 0 },
		}),
	);

	assert.equal(pricing.promoDiscountAmount, 2000);
	assert.equal(pricing.centralDiscountAmount, 0);
	assert.equal(pricing.centralDiscountPercent, 0);
	assert.equal(pricing.centralDiscountSuppressed, true);
	assert.equal(pricing.total, 8000);
	assert.equal(pricing.promo?.applied, true);
	assertConsistent(pricing, 10000);
});

test("центральная скидка выгоднее — промокод не применяется, и об этом сообщается", () => {
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 1500, percent: 15 },
			promo: { rule: rule({ discountPercent: 5 }), userRedemptions: 0 },
		}),
	);

	assert.equal(pricing.promoDiscountAmount, 0);
	assert.equal(pricing.centralDiscountAmount, 1500);
	assert.equal(pricing.centralDiscountSuppressed, false);
	assert.equal(pricing.total, 8500);

	assert.equal(pricing.promo?.applied, false);
	if (!pricing.promo || pricing.promo.applied) return;
	// Молчать нельзя: покупатель ввёл рабочий код и обязан узнать, почему
	// итог не изменился.
	assert.equal(pricing.promo.reason, "outweighed_by_discount");
	assertConsistent(pricing, 10000);
});

test("ввод промокода никогда не ухудшает итог", () => {
	const withoutPromo = resolveCheckoutPricing(
		input({ centralDiscount: { amount: 1500, percent: 15 } }),
	);
	const withPromo = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 1500, percent: 15 },
			promo: { rule: rule({ discountPercent: 5 }), userRedemptions: 0 },
		}),
	);

	assert.ok(withPromo.total <= withoutPromo.total);
});

test("равные суммы — применяется промокод", () => {
	// Ничья достаётся коду: покупатель совершил действие и должен увидеть его
	// результат, а сообщение «действующая скидка выгоднее» при равенстве было
	// бы неправдой.
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 1000, percent: 10 },
			promo: { rule: rule({ discountPercent: 10 }), userRedemptions: 0 },
		}),
	);

	assert.equal(pricing.promo?.applied, true);
	assert.equal(pricing.promoDiscountAmount, 1000);
	assert.equal(pricing.centralDiscountAmount, 0);
	assert.equal(pricing.centralDiscountSuppressed, true);
	assert.equal(pricing.total, 9000);
});

test("невалидный промокод не трогает центральную скидку", () => {
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 500, percent: 5 },
			promo: { rule: rule({ isActive: false }), userRedemptions: 0 },
		}),
	);

	assert.equal(pricing.centralDiscountAmount, 500);
	assert.equal(pricing.centralDiscountSuppressed, false);
	assert.equal(pricing.promoDiscountAmount, 0);
	assert.equal(pricing.promo?.applied, false);
	if (!pricing.promo || pricing.promo.applied) return;
	assert.equal(pricing.promo.reason, "inactive");
	assertConsistent(pricing, 10000);
});

test("центральной скидки нет — промокод применяется без вытеснения", () => {
	const pricing = resolveCheckoutPricing(
		input({
			promo: { rule: rule({ discountPercent: 10 }), userRedemptions: 0 },
		}),
	);

	assert.equal(pricing.promoDiscountAmount, 1000);
	assert.equal(pricing.centralDiscountSuppressed, false);
	assert.equal(pricing.total, 9000);
});

// ── Последовательное сложение (combinable = true) ───────────────────────────

test("сочетаемый код считается от остатка после центральной скидки", () => {
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 500, percent: 5 },
			promo: {
				rule: rule({ combinable: true, discountPercent: 10 }),
				userRedemptions: 0,
			},
		}),
	);

	// 10 000 − 500 = 9 500; 10 % от 9 500 = 950.
	assert.equal(pricing.centralDiscountAmount, 500);
	assert.equal(pricing.promoDiscountAmount, 950);
	assert.equal(pricing.total, 8550);
	assert.equal(pricing.centralDiscountSuppressed, false);
	assertConsistent(pricing, 10000);
});

test("сумма двух скидок не может превысить сумму заказа", () => {
	// Именно ради этого сложение сделано последовательным, а не «90 % + 90 %».
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 9000, percent: 90 },
			promo: {
				rule: rule({ combinable: true, discountPercent: 90 }),
				userRedemptions: 0,
			},
		}),
	);

	assert.ok(
		pricing.centralDiscountAmount + pricing.promoDiscountAmount <= 10000,
	);
	assert.equal(pricing.total, 100);
	assertConsistent(pricing, 10000);
});

test("сочетаемый фиксированный код ограничен остатком, а не корзиной", () => {
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 9000, percent: 90 },
			promo: {
				rule: rule({
					combinable: true,
					discountType: "fixed",
					discountPercent: null,
					fixedAmount: 5000,
				}),
				userRedemptions: 0,
			},
		}),
	);

	assert.equal(pricing.promoDiscountAmount, 1000);
	assert.equal(pricing.total, 0);
	assertConsistent(pricing, 10000);
});

test("центральная скидка покрыла заказ целиком — скидывать нечего", () => {
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 10000, percent: 100 },
			promo: { rule: rule({ combinable: true }), userRedemptions: 0 },
		}),
	);

	assert.equal(pricing.promoDiscountAmount, 0);
	assert.equal(pricing.total, 0);
	assert.equal(pricing.promo?.applied, false);
	if (!pricing.promo || pricing.promo.applied) return;
	// Причина именно «скидка выгоднее», а не «нет подходящих товаров»:
	// товары-то как раз подходят.
	assert.equal(pricing.promo.reason, "outweighed_by_discount");
});

test("адресный сочетаемый код: центральная скидка распределяется по позициям", () => {
	// Центральная скидка относится ко всей корзине, значит каждая позиция
	// несёт свою пропорциональную часть — иначе адресный код считался бы от
	// суммы, которую покупатель уже не платит.
	const pricing = resolveCheckoutPricing(
		input({
			items: [
				{ productId: "p1", categoryId: "c1", subtotal: 5000, quantity: 1 },
				{ productId: "p2", categoryId: "c2", subtotal: 5000, quantity: 1 },
			],
			centralDiscount: { amount: 2000, percent: 20 },
			promo: {
				rule: rule({
					combinable: true,
					discountPercent: 10,
					appliesToAllProducts: false,
					applicableCategoryIds: ["c1"],
				}),
				userRedemptions: 0,
			},
		}),
	);

	// Позиция «c1» после центральной скидки: 5000 * (8000/10000) = 4000.
	// 10 % от 4000 = 400.
	assert.equal(pricing.promoDiscountAmount, 400);
	assert.equal(pricing.total, 7600);
	assertConsistent(pricing, 10000);
});

test("минимальная сумма проверяется до корзинных скидок", () => {
	// Иначе действующая акция «уронила» бы заказ ниже порога и отключила
	// промокод без всякой понятной покупателю причины.
	const pricing = resolveCheckoutPricing(
		input({
			centralDiscount: { amount: 2000, percent: 20 },
			promo: {
				rule: rule({ combinable: true, minOrderAmount: 10000 }),
				userRedemptions: 0,
			},
		}),
	);

	assert.equal(pricing.promo?.applied, true);
	assert.equal(pricing.promoDiscountAmount, 800);
});

// ── Товарные скидки ─────────────────────────────────────────────────────────

test("промокод считается от суммы ПОСЛЕ товарных скидок", () => {
	const pricing = resolveCheckoutPricing(
		input({
			promo: { rule: rule({ discountPercent: 10 }), userRedemptions: 0 },
		}),
	);

	// 10 % от 10 000 (после товарной уступки), а не от 12 000.
	assert.equal(pricing.promoDiscountAmount, 1000);
	assert.equal(pricing.subtotal, 12000);
	assert.equal(pricing.productDiscount, 2000);
	assert.equal(pricing.totalDiscount, 3000);
});
