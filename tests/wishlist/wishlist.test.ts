/**
 * Избранное без базы: сортировки (с учётом скидки), подписи количества.
 *
 *   pnpm test  (входит в общий набор)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	pluralizeItems,
	pluralizeProducts,
	tailLabel,
} from "../../src/modules/wishlist/lib/format.ts";
import {
	DEFAULT_WISHLIST_SORT,
	findWishlistSortOption,
	sortWishlistItems,
	WISHLIST_SORT_OPTIONS,
} from "../../src/modules/wishlist/lib/sort.ts";
import type { WishlistItemView } from "../../src/modules/wishlist/types/index.ts";

const item = (
	title: string,
	price: number,
	addedAt: string,
	discount = 0,
): WishlistItemView =>
	({
		addedAt,
		product: {
			title,
			priceForIndividual: price,
			discount: { isActive: discount > 0, percentage: discount },
		},
	}) as unknown as WishlistItemView;

const A = item("Вултур 10", 1000, "2026-10-01T00:00:00Z");
const B = item("вултур 2", 900, "2026-10-03T00:00:00Z", 50); // 450 со скидкой
const C = item("Ёлка", 800, "не дата");
const titles = (items: WishlistItemView[]) => items.map((i) => i.product.title);

describe("sortWishlistItems", () => {
	test("по умолчанию — сначала новые; дата-мусор — в конец", () => {
		assert.equal(DEFAULT_WISHLIST_SORT, "added-desc");
		assert.deepEqual(titles(sortWishlistItems([A, C, B], "added-desc")), [
			"вултур 2",
			"Вултур 10",
			"Ёлка",
		]);
		assert.deepEqual(titles(sortWishlistItems([A, C, B], "added-asc")), [
			"Ёлка",
			"Вултур 10",
			"вултур 2",
		]);
	});

	test("по цене — с учётом скидки", () => {
		assert.deepEqual(titles(sortWishlistItems([A, B, C], "price-asc")), [
			"вултур 2",
			"Ёлка",
			"Вултур 10",
		]);
		assert.deepEqual(titles(sortWishlistItems([A, B, C], "price-desc")), [
			"Вултур 10",
			"Ёлка",
			"вултур 2",
		]);
	});

	test("по названию — без учёта регистра, числа по значению", () => {
		assert.deepEqual(titles(sortWishlistItems([A, C, B], "title-asc")), [
			"вултур 2",
			"Вултур 10",
			"Ёлка",
		]);
	});

	test("исходный массив не меняется", () => {
		const list = [A, B, C];
		sortWishlistItems(list, "title-asc");
		assert.deepEqual(list, [A, B, C]);
	});

	test("неизвестная сортировка — вариант по умолчанию", () => {
		assert.equal(
			findWishlistSortOption("nope" as never),
			WISHLIST_SORT_OPTIONS[0],
		);
		assert.equal(findWishlistSortOption("price-asc").label, "Сначала дешёвые");
	});
});

describe("подписи количества", () => {
	test("товар/товара/товаров, позицию/позиции/позиций", () => {
		assert.deepEqual([1, 2, 5, 11, 21, 104].map(pluralizeProducts), [
			"товар",
			"товара",
			"товаров",
			"товаров",
			"товар",
			"товара",
		]);
		assert.deepEqual([1, 3, 12, 22].map(pluralizeItems), [
			"позицию",
			"позиции",
			"позиций",
			"позиции",
		]);
		assert.equal(tailLabel(1), "Показан 1 товар");
		assert.equal(tailLabel(21), "Показаны все 21 товар");
		assert.equal(tailLabel(5), "Показаны все 5 товаров");
	});
});
