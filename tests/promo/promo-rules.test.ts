import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluatePromoCode } from "../../src/modules/promo/lib/promo-rules.ts";
import type {
	PromoCartItem,
	PromoCodeRule,
	PromoEvaluationContext,
} from "../../src/modules/promo/types.ts";

/**
 * Правила применения промокода — модульные тесты чистого ядра.
 *
 * Ни базы, ни Payload, ни сети: правило и корзина задаются литералами,
 * «сейчас» приходит аргументом. Ровно ради этого расчёт и вынесен в чистые
 * функции — иначе проверка «код истёк вчера» требовала бы поднятой базы с
 * подготовленным документом.
 *
 * Запуск: pnpm test:promo
 */

const NOW = new Date("2026-06-15T12:00:00.000Z");

function rule(overrides: Partial<PromoCodeRule> = {}): PromoCodeRule {
	return {
		id: "1",
		code: "SUMMER",
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

function item(overrides: Partial<PromoCartItem> = {}): PromoCartItem {
	return {
		productId: "p1",
		categoryId: "c1",
		subtotal: 10000,
		quantity: 1,
		...overrides,
	};
}

function context(
	overrides: Partial<PromoEvaluationContext> = {},
): PromoEvaluationContext {
	const items = overrides.items ?? [item()];
	return {
		items,
		orderAmount:
			overrides.orderAmount ?? items.reduce((s, i) => s + i.subtotal, 0),
		userRedemptions: overrides.userRedemptions ?? 0,
		now: overrides.now ?? NOW,
	};
}

// ── Расчёт суммы скидки ─────────────────────────────────────────────────────

test("процентный код: скидка считается от суммы подходящих позиций", () => {
	const result = evaluatePromoCode(rule({ discountPercent: 10 }), context());

	assert.equal(result.applied, true);
	if (!result.applied) return;
	assert.equal(result.discountAmount, 1000);
	assert.equal(result.discountPercent, 10);
	assert.equal(result.eligibleAmount, 10000);
	assert.equal(result.cappedByMax, false);
});

test("процентный код с потолком: скидка ограничена maxDiscountAmount", () => {
	const result = evaluatePromoCode(
		rule({ discountPercent: 20, maxDiscountAmount: 5000 }),
		context({ items: [item({ subtotal: 100000 })] }),
	);

	assert.equal(result.applied, true);
	if (!result.applied) return;
	// Без потолка было бы 20 000 ₽.
	assert.equal(result.discountAmount, 5000);
	assert.equal(result.cappedByMax, true);
	assert.match(result.message, /не более/);
});

test("потолок не срабатывает, пока скидка его не достигла", () => {
	const result = evaluatePromoCode(
		rule({ discountPercent: 20, maxDiscountAmount: 5000 }),
		context({ items: [item({ subtotal: 10000 })] }),
	);

	assert.equal(result.applied, true);
	if (!result.applied) return;
	assert.equal(result.discountAmount, 2000);
	assert.equal(result.cappedByMax, false);
});

test("фиксированный код: скидка равна заданной сумме", () => {
	const result = evaluatePromoCode(
		rule({ discountType: "fixed", discountPercent: null, fixedAmount: 1500 }),
		context(),
	);

	assert.equal(result.applied, true);
	if (!result.applied) return;
	assert.equal(result.discountAmount, 1500);
	assert.equal(result.discountPercent, null);
});

test("фиксированный код больше корзины: скидка не превышает сумму заказа", () => {
	// Иначе итог заказа стал бы отрицательным — магазин остался бы должен
	// покупателю.
	const result = evaluatePromoCode(
		rule({ discountType: "fixed", discountPercent: null, fixedAmount: 5000 }),
		context({ items: [item({ subtotal: 3000 })] }),
	);

	assert.equal(result.applied, true);
	if (!result.applied) return;
	assert.equal(result.discountAmount, 3000);
});

test("суммы округляются до копеек", () => {
	const result = evaluatePromoCode(
		rule({ discountPercent: 33 }),
		context({ items: [item({ subtotal: 100.05 })] }),
	);

	assert.equal(result.applied, true);
	if (!result.applied) return;
	// 100.05 * 0.33 = 33.0165 → 33.02
	assert.equal(result.discountAmount, 33.02);
});

// ── Срок действия ───────────────────────────────────────────────────────────

test("код ещё не начал действовать", () => {
	const result = evaluatePromoCode(
		rule({ startAt: "2026-07-01T00:00:00.000Z" }),
		context(),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "not_started");
});

test("срок действия истёк", () => {
	const result = evaluatePromoCode(
		rule({ endAt: "2026-06-01T00:00:00.000Z" }),
		context(),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "expired");
});

test("код действует в последний день срока", () => {
	// Граница включительна: код с endAt на конец дня обязан работать весь
	// этот день, иначе акция «до 15 июня» кончается 14-го.
	const result = evaluatePromoCode(
		rule({ endAt: "2026-06-15T23:59:59.000Z" }),
		context(),
	);

	assert.equal(result.applied, true);
});

test("выключённый код не применяется", () => {
	const result = evaluatePromoCode(rule({ isActive: false }), context());

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "inactive");
});

// ── Лимиты активаций ────────────────────────────────────────────────────────

test("общий лимит активаций исчерпан", () => {
	const result = evaluatePromoCode(
		rule({ maxUses: 100, totalUses: 100 }),
		context(),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "usage_limit_reached");
});

test("последняя активация ещё доступна", () => {
	const result = evaluatePromoCode(
		rule({ maxUses: 100, totalUses: 99 }),
		context(),
	);

	assert.equal(result.applied, true);
});

test("личный лимит пользователя исчерпан", () => {
	const result = evaluatePromoCode(
		rule({ maxUsesPerUser: 1 }),
		context({ userRedemptions: 1 }),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "user_limit_reached");
	assert.match(result.message, /уже использовали/);
});

test("личный лимит не мешает другому пользователю", () => {
	// totalUses > 0 означает, что код применяли другие; на личный лимит это
	// влиять не должно.
	const result = evaluatePromoCode(
		rule({ maxUsesPerUser: 1, totalUses: 42 }),
		context({ userRedemptions: 0 }),
	);

	assert.equal(result.applied, true);
});

// ── Минимальная сумма заказа ────────────────────────────────────────────────

test("сумма заказа ниже минимальной — в сообщении конкретная нехватка", () => {
	const result = evaluatePromoCode(
		rule({ minOrderAmount: 15000 }),
		context({ items: [item({ subtotal: 10000 })] }),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "min_order_amount");
	assert.equal(result.shortfall, 5000);
	// Intl разделяет разряды неразрывным пробелом — нормализуем, чтобы тест
	// проверял число, а не то, каким именно пробелом его отформатировали.
	assert.match(
		result.message.replace(/\u00a0/gu, " "),
		/добавьте товаров ещё на 5 000 ₽/,
	);
});

test("сумма заказа ровно равна минимальной — код применяется", () => {
	const result = evaluatePromoCode(
		rule({ minOrderAmount: 10000 }),
		context({ items: [item({ subtotal: 10000 })] }),
	);

	assert.equal(result.applied, true);
});

// ── Область действия ────────────────────────────────────────────────────────

test("адресный код считает скидку только от подходящих товаров", () => {
	const result = evaluatePromoCode(
		rule({
			discountPercent: 10,
			appliesToAllProducts: false,
			applicableCategoryIds: ["c1"],
		}),
		context({
			items: [
				item({ productId: "p1", categoryId: "c1", subtotal: 10000 }),
				item({ productId: "p2", categoryId: "c2", subtotal: 90000 }),
			],
		}),
	);

	assert.equal(result.applied, true);
	if (!result.applied) return;
	// 10 % от 10 000, а не от 100 000.
	assert.equal(result.eligibleAmount, 10000);
	assert.equal(result.discountAmount, 1000);
});

test("товар подходит по явному списку товаров, даже если категория чужая", () => {
	const result = evaluatePromoCode(
		rule({
			appliesToAllProducts: false,
			applicableCategoryIds: ["c9"],
			applicableProductIds: ["p2"],
		}),
		context({
			items: [
				item({ productId: "p1", categoryId: "c1", subtotal: 10000 }),
				item({ productId: "p2", categoryId: "c2", subtotal: 20000 }),
			],
		}),
	);

	assert.equal(result.applied, true);
	if (!result.applied) return;
	assert.equal(result.eligibleAmount, 20000);
});

test("в корзине нет подходящих товаров", () => {
	const result = evaluatePromoCode(
		rule({ appliesToAllProducts: false, applicableCategoryIds: ["c9"] }),
		context(),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "not_applicable_to_cart");
});

test("товар без категории не попадает под категорийный код", () => {
	const result = evaluatePromoCode(
		rule({ appliesToAllProducts: false, applicableCategoryIds: ["c1"] }),
		context({ items: [item({ categoryId: null })] }),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "not_applicable_to_cart");
});

// ── Порядок проверок ────────────────────────────────────────────────────────

test("исчерпанный лимит важнее недобранной суммы заказа", () => {
	// Предлагать «добавьте товаров» по коду, который уже мёртв, — ложная
	// подсказка: покупатель добавит товары и всё равно получит отказ.
	const result = evaluatePromoCode(
		rule({ maxUses: 1, totalUses: 1, minOrderAmount: 999999 }),
		context(),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "usage_limit_reached");
});

test("неподходящие товары важнее недобранной суммы заказа", () => {
	const result = evaluatePromoCode(
		rule({
			appliesToAllProducts: false,
			applicableCategoryIds: ["c9"],
			minOrderAmount: 999999,
		}),
		context(),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "not_applicable_to_cart");
});

test("пустая корзина важнее любых свойств кода", () => {
	const result = evaluatePromoCode(
		rule({ isActive: false, maxUses: 1, totalUses: 1 }),
		context({ items: [], orderAmount: 0 }),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "empty_cart");
});

// ── Некорректная настройка ──────────────────────────────────────────────────

test("процентный код с нулевым процентом не применяется", () => {
	const result = evaluatePromoCode(rule({ discountPercent: 0 }), context());

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "misconfigured");
	// Покупателю про ошибку настройки не сообщается.
	assert.match(result.message, /не найден/);
});

test("фиксированный код без суммы не применяется", () => {
	const result = evaluatePromoCode(
		rule({ discountType: "fixed", fixedAmount: null }),
		context(),
	);

	assert.equal(result.applied, false);
	if (result.applied) return;
	assert.equal(result.reason, "misconfigured");
});
