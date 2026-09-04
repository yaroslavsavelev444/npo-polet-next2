import assert from "node:assert/strict";
import { test } from "node:test";
import { SuggestionCache } from "../../src/modules/checkout/server/suggestion-cache.ts";

/**
 * Кэш подсказок адреса.
 *
 * Он существует ради дневной квоты провайдера, общей на весь аккаунт: без
 * вытеснения кэш растёт неограниченно (утечка памяти в долгоживущем
 * процессе), без TTL — отдаёт адреса, которых уже нет в справочнике.
 * Обе поломки бесшумны, поэтому проверяются здесь.
 *
 * Запуск: pnpm test:checkout
 */

test("значение возвращается до истечения TTL и исчезает после", () => {
	let now = 1_000;
	const cache = new SuggestionCache<string>(10, 5_000, () => now);

	cache.set("москва", "результат");
	assert.equal(cache.get("москва"), "результат");

	now += 4_999;
	assert.equal(cache.get("москва"), "результат");

	now += 2;
	assert.equal(cache.get("москва"), null);
	// Протухшая запись не должна оставаться занимать место.
	assert.equal(cache.size, 0);
});

test("неизвестный ключ не выдумывает значение", () => {
	const cache = new SuggestionCache<string>(10, 5_000);
	assert.equal(cache.get("нет такого"), null);
});

test("вытесняется давно не используемая запись, а не давно записанная", () => {
	// Разница принципиальна: «москва» набирают постоянно, и вытеснять её
	// только потому, что она попала в кэш первой, значит впустую тратить квоту.
	const cache = new SuggestionCache<string>(2, 60_000);

	cache.set("москва", "1");
	cache.set("казань", "2");
	cache.get("москва"); // обращение делает «москву» свежей

	cache.set("омск", "3");

	assert.equal(cache.get("москва"), "1");
	assert.equal(cache.get("казань"), null);
	assert.equal(cache.get("омск"), "3");
});

test("повторная запись того же ключа не вытесняет чужую", () => {
	const cache = new SuggestionCache<string>(2, 60_000);

	cache.set("москва", "1");
	cache.set("казань", "2");
	cache.set("москва", "обновлено");

	assert.equal(cache.size, 2);
	assert.equal(cache.get("москва"), "обновлено");
	assert.equal(cache.get("казань"), "2");
});

test("размер никогда не превышает лимит", () => {
	const cache = new SuggestionCache<number>(3, 60_000);

	for (let i = 0; i < 50; i++) cache.set(`ключ-${i}`, i);

	assert.equal(cache.size, 3);
	assert.equal(cache.get("ключ-49"), 49);
	assert.equal(cache.get("ключ-0"), null);
});

test("clear опустошает кэш", () => {
	const cache = new SuggestionCache<string>(5, 60_000);
	cache.set("а", "1");
	cache.clear();
	assert.equal(cache.size, 0);
	assert.equal(cache.get("а"), null);
});
