import assert from "node:assert/strict";
import { test } from "node:test";
import {
	flattenSections,
	moveActiveKey,
	resolveEnterTarget,
} from "../../src/modules/search/lib/entries.ts";
import type { SearchSection } from "../../src/modules/search/types.ts";

/**
 * Клавиатурная навигация по смешанной выдаче: порядок обхода, «Показать ещё»
 * как пункт списка, цель Enter.
 *
 * Запуск: pnpm test:search
 */

const sections = [
	{
		type: "knowledge",
		total: 1,
		approximate: false,
		items: [
			{
				id: "7",
				title: "Статья",
				href: "/knowledge/a/b",
				categoryTitle: null,
				snippet: null,
			},
		],
	},
	{
		type: "faq",
		total: 5,
		approximate: false,
		items: [
			{
				id: "q1",
				question: "Вопрос 1",
				href: "/faq#q1",
				topicTitle: "Тема",
				snippet: null,
			},
			{
				id: "q2",
				question: "Вопрос 2",
				href: "/faq#q2",
				topicTitle: "Тема",
				snippet: null,
			},
		],
	},
] as SearchSection[];

test("пункты идут секция за секцией, «Показать ещё» — последним в неполной секции", () => {
	const entries = flattenSections(sections);
	assert.deepEqual(
		entries.map((entry) => entry.key),
		["knowledge-7", "faq-q1", "faq-q2", "more-faq"],
	);
	const more = entries[3];
	assert.equal(more.kind, "more");
	assert.equal(more.kind === "more" && more.offset, 2);
});

test("стрелки ходят по кругу", () => {
	const entries = flattenSections(sections);
	assert.equal(moveActiveKey(entries, null, 1), "knowledge-7");
	assert.equal(moveActiveKey(entries, null, -1), "more-faq");
	assert.equal(moveActiveKey(entries, "more-faq", 1), "knowledge-7");
	assert.equal(moveActiveKey(entries, "faq-q1", -1), "knowledge-7");
	assert.equal(moveActiveKey([], null, 1), null);
});

test("Enter открывает выделенное, а без выделения — первый результат", () => {
	const entries = flattenSections(sections);
	assert.equal(resolveEnterTarget(entries, "faq-q2")?.key, "faq-q2");
	assert.equal(resolveEnterTarget(entries, null)?.key, "knowledge-7");
	// Выделение осталось от прежней выдачи — Enter не должен вести в никуда.
	assert.equal(resolveEnterTarget(entries, "product-404")?.key, "knowledge-7");
	assert.equal(resolveEnterTarget([], null), null);
});
