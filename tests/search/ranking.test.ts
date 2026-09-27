import assert from "node:assert/strict";
import { test } from "node:test";
import {
	matchesAllTerms,
	orderSections,
	scoreResult,
	sortByScore,
	titleMatchScore,
} from "../../src/modules/search/lib/ranking.ts";
import type { SearchResultType } from "../../src/modules/search/types.ts";

/**
 * Ранжирование поиска в шапке: одна мера для товаров, статей и FAQ.
 *
 * Запуск: pnpm test:search
 */

test("точное совпадение заголовка сильнее начала, начало — сильнее фразы внутри", () => {
	const exact = titleMatchScore("вултур p10v2", "«Вултур P10v2»");
	const prefix = titleMatchScore("вултур", "«Вултур P10v2»");
	const phrase = titleMatchScore("p10v2", "«Вултур P10v2» — вариант 2");
	const allTerms = titleMatchScore(
		"установка тройная",
		"Тройная стационарная установка",
	);

	assert.equal(exact, 1);
	assert.ok(prefix > phrase, "начало заголовка > фраза в середине");
	assert.ok(phrase > allTerms, "фраза целиком > слова вразброс");
	assert.ok(
		allTerms >
			titleMatchScore("установка кабель", "Тройная стационарная установка"),
	);
});

test("ё и регистр не влияют на совпадение", () => {
	assert.equal(titleMatchScore("СЕТКОМЕТ", "Сеткомёт"), 1);
});

test("словоформы считаются совпадением", () => {
	assert.ok(matchesAllTerms("сеткомёты", "Обслуживание ручного сеткомёта"));
	assert.ok(
		matchesAllTerms("обслуживание сеткомета", "Обслуживание ручного сеткомёта"),
	);
	assert.ok(
		!matchesAllTerms("обслуживание кабеля", "Обслуживание ручного сеткомёта"),
	);
});

test("совпадение в заголовке сильнее совпадения в характеристике и описании", () => {
	const inTitle = scoreResult({
		type: "product",
		query: "кабель",
		title: "Кабель ВЧ",
	});
	const inSpec = scoreResult({
		type: "product",
		query: "ip67",
		title: "Вултур",
		secondary: "spec",
	});
	const inDescription = scoreResult({
		type: "product",
		query: "мачта",
		title: "Траверса",
		secondary: "description",
	});

	assert.ok(inTitle > inSpec);
	assert.ok(inSpec > inDescription);
});

test("при равном совпадении товар выше статьи, статья выше вопроса FAQ", () => {
	const args = { query: "кабель", title: "Кабель ВЧ" };
	const product = scoreResult({ type: "product", ...args });
	const article = scoreResult({ type: "knowledge", ...args });
	const faq = scoreResult({ type: "faq", ...args });

	assert.ok(product > article);
	assert.ok(article > faq);
});

test("вопрос FAQ с точным заголовком обходит товар, где слово лишь в описании", () => {
	const faq = scoreResult({
		type: "faq",
		query: "какая гарантия",
		title: "Какая гарантия?",
	});
	const product = scoreResult({
		type: "product",
		query: "какая гарантия",
		title: "Вултур P10v2",
		secondary: "description",
	});

	assert.ok(faq > product);
});

test("нет в наличии — чуть ниже такого же товара в наличии", () => {
	const inStock = scoreResult({
		type: "product",
		query: "кабель",
		title: "Кабель ВЧ",
	});
	const outOfStock = scoreResult({
		type: "product",
		query: "кабель",
		title: "Кабель ВЧ",
		available: false,
	});
	assert.ok(inStock > outOfStock);
	assert.ok(
		outOfStock >
			scoreResult({
				type: "product",
				query: "кабель",
				title: "Кабельный ввод и разъём",
			}) *
				0.9,
	);
});

test("нечёткое совпадение всегда ниже любого точного", () => {
	const fuzzy = scoreResult({
		type: "product",
		query: "вултр",
		title: "Вултур",
		similarity: 1,
	});
	const weakestExact = scoreResult({
		type: "faq",
		query: "вултур",
		title: "Что-то",
		secondary: "body",
	});
	assert.ok(fuzzy < weakestExact);
});

test("сортировка устойчива: при равной оценке сохраняется порядок источника", () => {
	const items = [
		{ id: "a", score: 0.5 },
		{ id: "b", score: 0.9 },
		{ id: "c", score: 0.5 },
	];
	assert.deepEqual(
		sortByScore(items, (item) => item.score).map((item) => item.id),
		["b", "a", "c"],
	);
});

test("секции идут по лучшему результату; пустые отбрасываются; ничья — в пользу товаров", () => {
	const product: { type: SearchResultType } = { type: "product" };
	const knowledge: { type: SearchResultType } = { type: "knowledge" };
	const faq: { type: SearchResultType } = { type: "faq" };

	assert.deepEqual(
		orderSections([
			{ section: product, topScore: 0.4, size: 3 },
			{ section: knowledge, topScore: 0.7, size: 1 },
			{ section: faq, topScore: 0.9, size: 0 },
		]).map((s) => s.type),
		["knowledge", "product"],
	);

	assert.deepEqual(
		orderSections([
			{ section: faq, topScore: 0.5, size: 1 },
			{ section: product, topScore: 0.5, size: 1 },
		]).map((s) => s.type),
		["product", "faq"],
	);
});
