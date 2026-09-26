import assert from "node:assert/strict";
import { test } from "node:test";
import type { Order, Product } from "../../payload-types.ts";
import { planOrderRepeat } from "../../src/modules/cart/lib/repeat-order.ts";

/**
 * Повтор заказа: что ляжет в корзину и что об этом скажут покупателю.
 *
 * Проверяются обещания сводки: ни одна позиция заказа не пропадает молча,
 * цена берётся текущая и расхождение названо, количество приведено к
 * ограничениям товара, а повторный запуск не множит корзину.
 *
 * Запуск: pnpm test:cart
 */

type OrderItem = NonNullable<Order["items"]>[number];

const MAX_ITEM_QUANTITY = 1000;

function product(
	id: number,
	options: {
		price?: number;
		status?: NonNullable<Product["inventory"]>["status"];
		min?: number | null;
		max?: number | null;
		draft?: boolean;
		hidden?: boolean;
	} = {},
): Product {
	return {
		id,
		title: `Товар ${id}`,
		_status: options.draft ? "draft" : "published",
		pricing: { priceForIndividual: options.price ?? 1000 },
		inventory: {
			status: options.status ?? "available",
			minOrderQuantity: options.min ?? null,
			maxOrderQuantity: options.max ?? null,
			isVisible: !options.hidden,
		},
	} as unknown as Product;
}

function line(
	value: Product | number | null,
	quantity: number,
	unitFinalPrice = 1000,
	name = "Позиция",
): OrderItem {
	return {
		product: value as OrderItem["product"],
		name,
		quantity,
		unitPrice: unitFinalPrice,
		totalPrice: unitFinalPrice * quantity,
	};
}

/** Текущая цена в тестах — просто цена товара, без скидок. */
const priceOf = (p: Product) => p.pricing?.priceForIndividual ?? 0;

function plan(items: OrderItem[], cart: [string, number][] = []) {
	return planOrderRepeat({
		items,
		cartQuantities: new Map(cart),
		unitFinalPriceOf: priceOf,
		maxItemQuantity: MAX_ITEM_QUANTITY,
	});
}

test("доступная позиция ложится в корзину как в заказе", () => {
	const result = plan([line(product(1), 3)]);

	assert.deepEqual(result.writes, [{ productId: "1", quantity: 3 }]);
	assert.equal(result.skipped.length, 0);
	assert.deepEqual(result.lines[0], {
		productId: "1",
		title: "Позиция",
		orderedQuantity: 3,
		previousCartQuantity: 0,
		cartQuantity: 3,
		outcome: "added",
		quantityAdjustment: null,
		priceChange: null,
	});
});

test("изменившаяся цена берётся текущей и называется", () => {
	const result = plan([line(product(1, { price: 1350 }), 2, 1200)]);

	assert.deepEqual(result.lines[0].priceChange, {
		ordered: 1200,
		current: 1350,
	});
	// В корзину уходит только количество — цену корзина посчитает сама.
	assert.deepEqual(result.writes, [{ productId: "1", quantity: 2 }]);
});

test("прежняя цена — за единицу с товарной скидкой (totalPrice / quantity)", () => {
	const item: OrderItem = {
		product: product(1, { price: 900 }),
		name: "Сетка",
		quantity: 3,
		unitPrice: 1000,
		discount: 300,
		totalPrice: 2700,
	};
	assert.equal(plan([item]).lines[0].priceChange, null);
});

test("копеечная разница округления не считается изменением цены", () => {
	const item = line(product(1, { price: 333.33 }), 3);
	item.totalPrice = 1000; // 333.333… за штуку
	assert.equal(plan([item]).lines[0].priceChange, null);
});

test("меньше минимальной партии — количество поднимается до неё", () => {
	const result = plan([line(product(1, { min: 5 }), 2)]);

	assert.deepEqual(result.writes, [{ productId: "1", quantity: 5 }]);
	assert.deepEqual(result.lines[0].quantityAdjustment, {
		reason: "min_order",
		limit: 5,
	});
});

test("больше предела на заказ — количество опускается до него", () => {
	const result = plan([line(product(1, { max: 10 }), 20)]);

	assert.deepEqual(result.writes, [{ productId: "1", quantity: 10 }]);
	assert.deepEqual(result.lines[0].quantityAdjustment, {
		reason: "max_order",
		limit: 10,
	});
});

test("без своего предела действует предел корзины", () => {
	const result = plan([line(product(1), 1500)]);

	assert.deepEqual(result.writes, [
		{ productId: "1", quantity: MAX_ITEM_QUANTITY },
	]);
	assert.deepEqual(result.lines[0].quantityAdjustment, {
		reason: "max_order",
		limit: MAX_ITEM_QUANTITY,
	});
});

test("недоступные позиции не пишутся в корзину, но попадают в сводку", () => {
	const result = plan([
		line(product(1, { status: "out_of_stock" }), 1, 1000, "Нет на складе"),
		line(product(2, { status: "discontinued" }), 1, 1000, "Снятый"),
		line(product(3, { draft: true }), 1, 1000, "Черновик"),
		line(product(4, { hidden: true }), 1, 1000, "Скрытый"),
		line(null, 2, 1000, "Удалённый"),
		line(product(5), 1),
	]);

	assert.deepEqual(result.writes, [{ productId: "5", quantity: 1 }]);
	assert.deepEqual(
		result.skipped.map((s) => [s.title, s.statusLabel, s.quantity]),
		[
			["Нет на складе", "Нет в наличии", 1],
			["Снятый", "Снят с производства", 1],
			["Черновик", "Снят с продажи", 1],
			["Скрытый", "Снят с продажи", 1],
			["Удалённый", "Товара больше нет в каталоге", 2],
		],
	);
});

test("полностью недоступный заказ — нечего писать, всё в сводке", () => {
	const result = plan([line(product(1, { status: "out_of_stock" }), 1)]);

	assert.equal(result.writes.length, 0);
	assert.equal(result.lines.length, 0);
	assert.equal(result.skipped.length, 1);
});

test("повторный запуск не множит корзину", () => {
	const items = [line(product(1), 3), line(product(2, { min: 4 }), 1)];

	const first = plan(items);
	const cartAfterFirst = first.writes.map(
		(w) => [w.productId, w.quantity] as [string, number],
	);
	const second = plan(items, cartAfterFirst);

	assert.equal(second.writes.length, 0);
	assert.deepEqual(
		second.lines.map((l) => [l.outcome, l.cartQuantity]),
		[
			["already_in_cart", 3],
			["already_in_cart", 4],
		],
	);
});

test("в корзине меньше, чем в заказе, — доводится до заказа, а не складывается", () => {
	const result = plan([line(product(1), 5)], [["1", 2]]);

	assert.deepEqual(result.writes, [{ productId: "1", quantity: 5 }]);
	assert.equal(result.lines[0].previousCartQuantity, 2);
	assert.equal(result.lines[0].cartQuantity, 5);
});

test("в корзине уже больше — позиция не трогается", () => {
	const result = plan([line(product(1), 2)], [["1", 7]]);

	assert.equal(result.writes.length, 0);
	assert.equal(result.lines[0].outcome, "already_in_cart");
	assert.equal(result.lines[0].cartQuantity, 7);
});

test("дубли одного товара в заказе складываются", () => {
	const p = product(1);
	const result = plan([line(p, 2), line(p, 3)]);

	assert.deepEqual(result.writes, [{ productId: "1", quantity: 5 }]);
	assert.equal(result.lines.length, 1);
	assert.equal(result.lines[0].orderedQuantity, 5);
});
