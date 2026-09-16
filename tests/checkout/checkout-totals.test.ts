import assert from "node:assert/strict";
import { test } from "node:test";
import type { CartView } from "../../src/modules/cart/types/index.ts";
import { buildCheckoutTotals } from "../../src/modules/checkout/lib/checkout-totals.ts";
import type { ProductCardData } from "../../src/modules/productCard/types/index.ts";
import type { PromoApplyPreview } from "../../src/modules/promo/types.ts";

/**
 * Разбор итоговой суммы на странице оформления заказа.
 *
 * Проверяется ровно одно обещание интерфейса: строки расчёта, показанные
 * покупателю, в сумме дают тот же итог, который уйдёт в заказ. Скидка,
 * потерявшаяся между строками, — это не косметика: человек подтверждает сумму,
 * происхождение которой не может проверить.
 *
 * Запуск: pnpm test:checkout
 */

const NOW = "2026-06-15T12:00:00.000Z";

function product(id: string): ProductCardData {
	return {
		id,
		title: `Товар ${id}`,
		slug: `tovar-${id}`,
		images: [],
		category: null,
		priceForIndividual: 1200,
		discount: { isActive: true, percentage: 17 },
		status: "available",
		minOrderQuantity: 1,
		maxOrderQuantity: 100,
		rating: 0,
		reviewsCount: 0,
	};
}

/** Корзина: 10 штук по 1200 ₽, товарная скидка 2 000 ₽ → база 10 000 ₽. */
function cart(
	options: {
		centralAmount?: number;
		centralPercent?: number;
		centralName?: string;
	} = {},
): CartView {
	const centralDiscountAmount = options.centralAmount ?? 0;
	const centralDiscountPercent = options.centralPercent ?? 0;

	return {
		items: [
			{
				product: product("p1"),
				quantity: 10,
				addedAt: NOW,
				unitPrice: 1200,
				unitFinalPrice: 1000,
				subtotal: 10000,
				subtotalWithoutDiscount: 12000,
				itemDiscount: 2000,
			},
		],
		summary: {
			totalItems: 10,
			itemsCount: 1,
			priceWithoutDiscount: 12000,
			productDiscountAmount: 2000,
			centralDiscountAmount,
			centralDiscountPercent,
			totalDiscount: 2000 + centralDiscountAmount,
			totalPrice: 10000 - centralDiscountAmount,
		},
		validation: { isValid: true, issues: [] },
		discounts: {
			applied:
				centralDiscountAmount > 0
					? [
							{
								id: "d1",
								name: options.centralName ?? "Оптовая скидка",
								discountPercent: centralDiscountPercent,
								amount: centralDiscountAmount,
								message: "Скидка применена",
							},
						]
					: [],
			hints: [],
		},
		unavailable: [],
		updatedAt: NOW,
	};
}

function preview(overrides: Partial<PromoApplyPreview>): PromoApplyPreview {
	return {
		code: "SUMMER",
		discountAmount: 0,
		discountPercent: null,
		centralDiscountAmount: 0,
		centralDiscountSuppressed: false,
		totalDiscount: 0,
		total: 0,
		message: "Промокод применён",
		...overrides,
	};
}

/** Сумма всех строк разбора. */
function sumOfLines(lines: { amount: number }[]): number {
	return lines.reduce((sum, line) => sum + line.amount, 0);
}

test("без скидок корзины показывается только товарная", () => {
	const totals = buildCheckoutTotals(cart(), null);

	assert.deepEqual(
		totals.discounts.map((line) => line.kind),
		["product"],
	);
	assert.equal(totals.subtotal, 12000);
	assert.equal(totals.total, 10000);
	assert.equal(totals.totalDiscount, 2000);
	assert.equal(totals.breakdownIsExact, true);
});

test("товарная и корзинная скидки — две отдельные строки", () => {
	const totals = buildCheckoutTotals(
		cart({ centralAmount: 500, centralPercent: 5, centralName: "Опт 5%" }),
		null,
	);

	assert.deepEqual(
		totals.discounts.map((line) => line.kind),
		["product", "central"],
	);

	const central = totals.discounts[1];
	// Имя акции берётся из корзины: покупатель видел его там же.
	assert.equal(central.label, "Опт 5%");
	// Процент уже назван в имени — вторым значком его не повторяем.
	assert.equal(central.percent, null);
	assert.equal(central.amount, 500);

	assert.equal(totals.total, 9500);
	assert.equal(sumOfLines(totals.discounts), totals.totalDiscount);
	assert.equal(totals.breakdownIsExact, true);
});

test("процент акции показывается, если в имени его нет", () => {
	const totals = buildCheckoutTotals(
		cart({
			centralAmount: 500,
			centralPercent: 5,
			centralName: "Скидка постоянному покупателю",
		}),
		null,
	);

	assert.equal(totals.discounts[1].percent, 5);
});

test("процент 5 не считается названным внутри «15%»", () => {
	// Граница числа, а не вхождение подстроки: иначе значок пропадал бы у
	// акции, название которой её процента не называет.
	const totals = buildCheckoutTotals(
		cart({ centralAmount: 500, centralPercent: 5, centralName: "Лето 15%" }),
		null,
	);

	assert.equal(totals.discounts[1].percent, 5);
});

test("промокод добавляет свою строку с кодом и не трогает остальные", () => {
	const view = cart({ centralAmount: 500, centralPercent: 5 });
	// Совместимый код: центральная скидка осталась, промокод посчитан от остатка.
	const totals = buildCheckoutTotals(
		view,
		preview({
			code: "SUMMER",
			discountAmount: 950,
			discountPercent: 10,
			centralDiscountAmount: 500,
			totalDiscount: 3450,
			total: 8550,
		}),
	);

	assert.deepEqual(
		totals.discounts.map((line) => line.kind),
		["product", "central", "promo"],
	);
	assert.equal(totals.discounts[2].code, "SUMMER");
	assert.equal(totals.discounts[2].amount, 950);
	assert.equal(totals.total, 8550);
	assert.equal(totals.totalDiscount, 3450);
	assert.equal(sumOfLines(totals.discounts), 3450);
	assert.equal(totals.breakdownIsExact, true);
});

test("вытесненная промокодом скидка корзины исчезает из разбора и отмечается", () => {
	// Несовместимый код оказался выгоднее: корзинная скидка обнулена сервером.
	const view = cart({ centralAmount: 500, centralPercent: 5 });
	const totals = buildCheckoutTotals(
		view,
		preview({
			code: "BIG",
			discountAmount: 1500,
			discountPercent: 15,
			centralDiscountAmount: 0,
			centralDiscountSuppressed: true,
			totalDiscount: 3500,
			total: 8500,
		}),
	);

	assert.deepEqual(
		totals.discounts.map((line) => line.kind),
		["product", "promo"],
	);
	assert.equal(totals.centralDiscountSuppressed, true);
	assert.equal(totals.total, 8500);
	// Показанная скидка по-прежнему сходится с итогом — 2000 + 1500.
	assert.equal(sumOfLines(totals.discounts), totals.totalDiscount);
	assert.equal(totals.breakdownIsExact, true);
});

test("итог берётся из предпросмотра промокода, а не из корзины", () => {
	// Корзина о промокоде не знает: её totalPrice — 10 000. Показывать его
	// рядом с применённым кодом значило бы обещать цену без скидки.
	const totals = buildCheckoutTotals(
		cart(),
		preview({ discountAmount: 1000, totalDiscount: 3000, total: 9000 }),
	);

	assert.equal(totals.total, 9000);
	assert.equal(totals.promoApplied, true);
});

test("разбор, не сходящийся с итогом, помечается неточным", () => {
	// Патология: скидки уперлись в сумму заказа и были ограничены сервером
	// (clamp в resolveCheckoutPricing). Складывать такие строки нельзя —
	// интерфейс обязан показать одну честную величину.
	const totals = buildCheckoutTotals(
		cart({ centralAmount: 500, centralPercent: 5 }),
		preview({
			discountAmount: 9600,
			centralDiscountAmount: 500,
			totalDiscount: 12000,
			total: 0,
		}),
	);

	assert.equal(totals.total, 0);
	assert.equal(totals.totalDiscount, 12000);
	// 2000 + 500 + 9600 = 12 100 ≠ 12 000.
	assert.equal(totals.breakdownIsExact, false);
});

test("количество и число позиций берутся из корзины", () => {
	const totals = buildCheckoutTotals(cart(), null);

	assert.equal(totals.itemsQuantity, 10);
	assert.equal(totals.positions, 1);
});
