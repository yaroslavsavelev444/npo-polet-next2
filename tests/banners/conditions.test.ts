import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	BannerAudienceFacts,
	BannerCondition,
} from "../../src/modules/banners/conditions.ts";
import {
	bannerWeight,
	evaluateConditions,
	matchesClientContext,
	matchesPath,
} from "../../src/modules/banners/conditions.ts";

/**
 * Условия показа баннеров.
 *
 * Эти правила решают, КОМУ показать баннер, и ошибка в них не падает, а тихо
 * показывает рекламу не тем людям — или не показывает никому. Проверяется
 * таблицей значений, потому что наблюдать за продом здесь поздно.
 *
 * Запуск: pnpm test:banners
 */

const FACTS: BannerAudienceFacts = {
	accountAgeDays: 30,
	emailVerified: true,
	totalOrders: 3,
	deliveredOrders: 2,
	activeOrders: 1,
	daysSinceLastOrder: 10,
	cartItems: 2,
	cartTotal: 15_000,
	cartIdleHours: 48,
	wishlistItems: 4,
	reviewsWritten: 1,
	pendingReviews: 2,
	actionAgeDays: { order_placed: 10, order_delivered: 20 },
};

const facts = (
	patch: Partial<BannerAudienceFacts> = {},
): BannerAudienceFacts => ({
	...FACTS,
	...patch,
});

const check = (
	conditions: BannerCondition[],
	patch: Partial<BannerAudienceFacts> = {},
	path: string | null = "/",
) =>
	evaluateConditions({
		conditions,
		match: "all",
		facts: facts(patch),
		context: path === null ? null : { path },
	});

/* ------------------------------------------------------------ страницы --- */

test("раздел покрывает свои вложенные страницы", () => {
	assert.equal(matchesPath(["/category"], "/category"), true);
	assert.equal(matchesPath(["/category"], "/category/nasosy"), true);
	assert.equal(matchesPath(["/category"], "/categories"), false);
});

test("корень совпадает только с главной, а не со всем сайтом", () => {
	// Буквальное префиксное сравнение сделало бы «/» префиксом любого адреса и
	// молча превратило «показывать на главной» в «показывать везде».
	assert.equal(matchesPath(["/"], "/"), true);
	assert.equal(matchesPath(["/"], "/cart"), false);
	assert.equal(matchesPath(["/", "/wishlist"], "/wishlist/x"), true);
});

test("пустой список путей означает «на любой странице»", () => {
	assert.equal(matchesPath([], "/whatever"), true);
});

test("неизвестный адрес не выполняет условие страницы, но винит в этом страницу", () => {
	const result = check([{ kind: "page", paths: ["/cart"] }], {}, null);

	assert.equal(result.matched, false);
	assert.equal(result.blockedByPage, true);
});

test("не тот экран отличается от «не тот человек»", () => {
	const wrongPage = check(
		[
			{ kind: "page", paths: ["/cart"] },
			{ kind: "wishlist", items: { min: 1, max: null } },
		],
		{},
		"/",
	);
	assert.deepEqual(wrongPage, { matched: false, blockedByPage: true });

	const wrongPerson = check(
		[
			{ kind: "page", paths: ["/"] },
			{ kind: "wishlist", items: { min: 99, max: null } },
		],
		{},
		"/",
	);
	assert.deepEqual(wrongPerson, { matched: false, blockedByPage: false });
});

/* -------------------------------------------------------------- заказы --- */

test("количество заказов считается по выбранному набору", () => {
	const range = { min: 2, max: 2 };
	assert.equal(
		check([{ kind: "order-count", scope: "delivered", count: range }]).matched,
		true,
	);
	assert.equal(
		check([{ kind: "order-count", scope: "active", count: range }]).matched,
		false,
	);
	assert.equal(
		check([{ kind: "order-count", scope: "any", count: range }]).matched,
		false,
	);
});

test("«давно не заказывал» спрашивается только у всех заказов сразу", () => {
	const long = {
		kind: "order-count" as const,
		scope: "any" as const,
		count: { min: 1, max: null },
		daysSinceLast: { min: 90, max: null },
	};
	assert.equal(check([long]).matched, false);
	assert.equal(check([long], { daysSinceLastOrder: 120 }).matched, true);

	// У «доставленных» диапазон игнорируется: у них своя дата, и отвечать на
	// вопрос чужим полем значит отвечать не на тот вопрос.
	assert.equal(
		check([{ ...long, scope: "delivered", count: { min: 2, max: 2 } }]).matched,
		true,
	);
});

/* ------------------------------------------------------------- корзина --- */

test("пустая и непустая корзина — взаимоисключающие состояния", () => {
	assert.equal(check([{ kind: "cart", state: "filled" }]).matched, true);
	assert.equal(check([{ kind: "cart", state: "empty" }]).matched, false);
	assert.equal(
		check([{ kind: "cart", state: "empty" }], { cartItems: 0 }).matched,
		true,
	);
});

test("забытая корзина ловится часами без изменений", () => {
	const forgotten: BannerCondition = {
		kind: "cart",
		state: "filled",
		idleHours: { min: 24, max: null },
	};
	assert.equal(check([forgotten]).matched, true);
	assert.equal(check([forgotten], { cartIdleHours: 2 }).matched, false);
});

test("незаполненные границы диапазона вопроса не задают", () => {
	assert.equal(
		check([
			{
				kind: "cart",
				state: "filled",
				items: { min: null, max: null },
				total: { min: null, max: null },
				idleHours: { min: null, max: null },
			},
		]).matched,
		true,
	);
});

/* -------------------------------------------------------------- прочее --- */

test("действие: «совершал за N суток» и «не совершал никогда» — разные вопросы", () => {
	const recent: BannerCondition = {
		kind: "action",
		action: "order_placed",
		performed: true,
		withinDays: 14,
	};
	assert.equal(check([recent]).matched, true);
	assert.equal(
		check([recent], { actionAgeDays: { order_placed: 100 } }).matched,
		false,
	);

	const never: BannerCondition = {
		kind: "action",
		action: "review_left",
		performed: false,
		withinDays: null,
	};
	assert.equal(check([never]).matched, true);
	assert.equal(
		check([never], { actionAgeDays: { review_left: 3 } }).matched,
		false,
	);
});

test("неизвестный факт не выполняет условие и никогда не читается как ноль", () => {
	// Сбой чтения заказов обязан означать «не показывать баннер про заказы», а
	// не «показать всем баннер „оформите первый заказ“».
	assert.equal(
		check(
			[
				{
					kind: "order-count",
					scope: "any",
					count: { min: 0, max: 0 },
					daysSinceLast: { min: 0, max: null },
				},
			],
			{ totalOrders: 0, daysSinceLastOrder: null },
		).matched,
		false,
	);
});

/* ---------------------------------------------------------- объединение --- */

test("пустой список условий — «всем авторизованным», в обоих режимах", () => {
	for (const match of ["all", "any"] as const) {
		const result = evaluateConditions({
			conditions: [],
			match,
			facts: facts(),
			context: { path: "/" },
		});
		assert.deepEqual(result, { matched: true, blockedByPage: false });
	}
});

test("«хотя бы одно» проверяет серверные и клиентские условия вместе", () => {
	// Раздельная проверка дала бы здесь `false`: ни одна половина сама по себе
	// не набирает «хотя бы одно».
	const result = evaluateConditions({
		conditions: [
			{ kind: "wishlist", items: { min: 99, max: null } },
			{ kind: "page", paths: ["/"] },
		],
		match: "any",
		facts: facts(),
		context: { path: "/" },
	});
	assert.equal(result.matched, true);
});

test("клиентская перепроверка не отменяет решения сервера при «хотя бы одно»", () => {
	const conditions: BannerCondition[] = [{ kind: "page", paths: ["/cart"] }];

	assert.equal(matchesClientContext(conditions, "all", { path: "/" }), false);
	assert.equal(matchesClientContext(conditions, "any", { path: "/" }), true);
	assert.equal(matchesClientContext([], "all", { path: "/" }), true);
});

/* -------------------------------------------------------------- очередь --- */

test("важный баннер обгоняет обычный при любом приоритете", () => {
	assert.ok(bannerWeight("important", 0) > bannerWeight("normal", 1000));
	assert.ok(bannerWeight("normal", 100) > bannerWeight("normal", 50));
	// Умножение вместо сложения дало бы важному с нулевым приоритетом нулевой
	// вес — ровно противоположный результат.
	assert.ok(bannerWeight("important", 0) > 0);
});
