import assert from "node:assert/strict";
import { test } from "node:test";
import type { CartView } from "../../src/modules/cart/types/index.ts";
import { calculateCheckoutPricing } from "../../src/modules/checkout/lib/checkout-pricing.ts";
import { checkoutSchema } from "../../src/modules/checkout/lib/checkout-schema.ts";
import type { ProductCardData } from "../../src/modules/productCard/types/index.ts";
import type { PromoCodeRule } from "../../src/modules/promo/types.ts";

/**
 * Интеграция промокодов с оформлением заказа.
 *
 * Здесь проверяется путь целиком: витрина корзины (со своими товарными и
 * центральной скидками) → мост checkout-pricing → правила промокода → итог,
 * который уйдёт в заказ. Модульные тесты выше проверяют правила в вакууме;
 * этот файл — что величины корзины подставляются в них ТЕ САМЫЕ.
 *
 * Именно эта склейка ломается тише всего: переименуй поле в CartSummary — и
 * промокод молча начнёт считаться от суммы без учёта товарных скидок.
 *
 * Запуск: pnpm test:promo
 */

const NOW = new Date("2026-06-15T12:00:00.000Z");

function product(id: string, categoryId: string | null): ProductCardData {
	return {
		id,
		title: `Товар ${id}`,
		slug: `tovar-${id}`,
		images: [],
		category: categoryId ? { id: categoryId, slug: `cat-${categoryId}` } : null,
		priceForIndividual: 1000,
		discount: { isActive: false, percentage: null },
		status: "available",
		minOrderQuantity: 1,
		maxOrderQuantity: 100,
		rating: 0,
		reviewsCount: 0,
	};
}

/**
 * Корзина: две позиции из разных категорий, товарная скидка 2 000 ₽.
 * Сумма без скидок 12 000 ₽, после товарных скидок — 10 000 ₽.
 */
function cart(
	options: { centralAmount?: number; centralPercent?: number } = {},
): CartView {
	const centralDiscountAmount = options.centralAmount ?? 0;
	const centralDiscountPercent = options.centralPercent ?? 0;

	return {
		items: [
			{
				product: product("p1", "c1"),
				quantity: 5,
				addedAt: NOW.toISOString(),
				unitPrice: 1200,
				unitFinalPrice: 1000,
				subtotal: 5000,
				subtotalWithoutDiscount: 6000,
				itemDiscount: 1000,
			},
			{
				product: product("p2", "c2"),
				quantity: 5,
				addedAt: NOW.toISOString(),
				unitPrice: 1200,
				unitFinalPrice: 1000,
				subtotal: 5000,
				subtotalWithoutDiscount: 6000,
				itemDiscount: 1000,
			},
		],
		summary: {
			totalItems: 10,
			itemsCount: 2,
			priceWithoutDiscount: 12000,
			productDiscountAmount: 2000,
			centralDiscountAmount,
			centralDiscountPercent,
			totalDiscount: 2000 + centralDiscountAmount,
			totalPrice: 10000 - centralDiscountAmount,
		},
		validation: { isValid: true, issues: [] },
		discounts: { applied: [], hints: [] },
		updatedAt: NOW.toISOString(),
	};
}

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

// ── Мост корзина → промокод ─────────────────────────────────────────────────

test("база скидки — сумма корзины после товарных скидок", () => {
	const pricing = calculateCheckoutPricing(
		cart(),
		{ rule: rule({ discountPercent: 10 }), userRedemptions: 0 },
		NOW,
	);

	// 10 % от 10 000, а не от 12 000: часть цены уже уступлена на товарах.
	assert.equal(pricing.promoDiscountAmount, 1000);
	assert.equal(pricing.subtotal, 12000);
	assert.equal(pricing.productDiscount, 2000);
	assert.equal(pricing.total, 9000);
	assert.equal(pricing.totalDiscount, 3000);
});

test("категории товаров доходят до правил адресного кода", () => {
	const pricing = calculateCheckoutPricing(
		cart(),
		{
			rule: rule({
				discountPercent: 10,
				appliesToAllProducts: false,
				applicableCategoryIds: ["c1"],
			}),
			userRedemptions: 0,
		},
		NOW,
	);

	// Подходит только первая позиция (5 000 ₽).
	assert.equal(pricing.promoDiscountAmount, 500);
});

test("идентификаторы товаров доходят до правил адресного кода", () => {
	const pricing = calculateCheckoutPricing(
		cart(),
		{
			rule: rule({
				discountType: "fixed",
				discountPercent: null,
				fixedAmount: 100000,
				appliesToAllProducts: false,
				applicableProductIds: ["p2"],
			}),
			userRedemptions: 0,
		},
		NOW,
	);

	// Фиксированный код обрезается суммой подходящих позиций, а не всей
	// корзины: скидка на «p2» не может превысить его собственную стоимость.
	assert.equal(pricing.promoDiscountAmount, 5000);
});

test("без промокода итог совпадает с итогом корзины", () => {
	const view = cart({ centralAmount: 500, centralPercent: 5 });
	const pricing = calculateCheckoutPricing(view, null, NOW);

	assert.equal(pricing.total, view.summary.totalPrice);
	assert.equal(pricing.totalDiscount, view.summary.totalDiscount);
	assert.equal(pricing.promoDiscountAmount, 0);
	assert.equal(pricing.promo, null);
});

// ── Взаимодействие с центральной скидкой на реальной корзине ────────────────

test("промокод вытесняет менее выгодную центральную скидку", () => {
	const pricing = calculateCheckoutPricing(
		cart({ centralAmount: 500, centralPercent: 5 }),
		{ rule: rule({ discountPercent: 20 }), userRedemptions: 0 },
		NOW,
	);

	assert.equal(pricing.centralDiscountAmount, 0);
	assert.equal(pricing.centralDiscountPercent, 0);
	assert.equal(pricing.centralDiscountSuppressed, true);
	assert.equal(pricing.promoDiscountAmount, 2000);
	assert.equal(pricing.total, 8000);
});

test("сочетаемый промокод складывается с центральной скидкой", () => {
	const pricing = calculateCheckoutPricing(
		cart({ centralAmount: 500, centralPercent: 5 }),
		{
			rule: rule({ combinable: true, discountPercent: 10 }),
			userRedemptions: 0,
		},
		NOW,
	);

	assert.equal(pricing.centralDiscountAmount, 500);
	assert.equal(pricing.promoDiscountAmount, 950);
	assert.equal(pricing.total, 8550);
	assert.equal(pricing.totalDiscount, 3450);
});

test("истёкший код оставляет заказ с одной центральной скидкой", () => {
	const pricing = calculateCheckoutPricing(
		cart({ centralAmount: 500, centralPercent: 5 }),
		{ rule: rule({ endAt: "2026-06-01T00:00:00.000Z" }), userRedemptions: 0 },
		NOW,
	);

	assert.equal(pricing.promoDiscountAmount, 0);
	assert.equal(pricing.centralDiscountAmount, 500);
	assert.equal(pricing.total, 9500);
	assert.equal(pricing.promo?.applied, false);
});

// ── Схема оформления заказа ─────────────────────────────────────────────────

const VALID_ORDER = {
	customer: { phone: "+79991234567" },
	recipient: {
		fullName: "Иванов Иван Иванович",
		phone: "",
		email: "ivan@example.com",
		saveRecipient: false,
	},
	contactPreference: "customer" as const,
	delivery: {
		method: "self_pickup" as const,
		pickupPointId: "1",
		saveAddress: false,
	},
	paymentMethod: "self_pickup_cash" as const,
};

test("заказ без промокода валиден", () => {
	assert.equal(checkoutSchema.safeParse(VALID_ORDER).success, true);
});

test("заказ с корректным промокодом валиден", () => {
	const result = checkoutSchema.safeParse({
		...VALID_ORDER,
		promoCode: "SUMMER24",
	});
	assert.equal(result.success, true);
});

test("схема принимает код в любом регистре", () => {
	// Приведение к каноническому виду — не дело схемы: она проверяет форму,
	// а нормализацию выполняет сервер перед обращением к базе.
	const result = checkoutSchema.safeParse({
		...VALID_ORDER,
		promoCode: " summer24 ",
	});
	assert.equal(result.success, true);
});

test("заведомо невозможный код отклоняется до обращения к базе", () => {
	const result = checkoutSchema.safeParse({
		...VALID_ORDER,
		promoCode: "СКИДКА!!!",
	});

	assert.equal(result.success, false);
	if (result.success) return;
	assert.ok(
		result.error.issues.some((issue) => issue.path[0] === "promoCode"),
		"ошибка должна быть привязана к полю промокода",
	);
});

test("слишком длинный промокод отклоняется", () => {
	const result = checkoutSchema.safeParse({
		...VALID_ORDER,
		promoCode: "A".repeat(64),
	});
	assert.equal(result.success, false);
});

test("пустой промокод не считается ошибкой", () => {
	// Пустое поле — это «код не вводили», а не «код неверный».
	assert.equal(
		checkoutSchema.safeParse({ ...VALID_ORDER, promoCode: "" }).success,
		true,
	);
});
