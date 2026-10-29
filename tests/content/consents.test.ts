/**
 * Разбор текста соглашений (src/modules/consents/lib/parseConsent.ts).
 * Образцы — фрагменты опубликованных документов в том виде, в каком их
 * вставляют в админку из Word: без разметки, с табуляциями и слипшимися
 * строками.
 *
 *   pnpm test  (входит в общий набор)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	parseConsent,
	parseRussianDate,
} from "../../src/modules/consents/lib/parseConsent.ts";

describe("parseConsent: шапка", () => {
	test("даты и редакция отдельными строками, наименование остаётся уточнением", () => {
		const parsed = parseConsent(
			[
				"Публичная оферта на заключение договора розничной купли-продажи",
				"Дата публикации: 14 октября 2026 года",
				"Дата вступления в силу: 24 октября 2026 года",
				"Редакция № 3 от 14.10.2026",
				"Настоящая публичная оферта адресована неограниченному кругу лиц.",
			].join("\n"),
			"Публичная оферта",
		);

		assert.equal(
			parsed.fullTitle,
			"Публичная оферта на заключение договора розничной купли-продажи",
		);
		assert.equal(parsed.published, "14 октября 2026");
		assert.equal(parsed.effective, "24 октября 2026");
		assert.equal(parsed.edition, "Редакция № 3");
		assert.deepEqual(parsed.blocks, [
			{
				type: "paragraph",
				text: "Настоящая публичная оферта адресована неограниченному кругу лиц.",
			},
		]);
	});

	test("всё в одной строке вместе с наименованием; повтор заголовка отбрасывается", () => {
		const parsed = parseConsent(
			"Согласие на обработку персональных данных Дата публикации: 14 октября 2026 года Дата вступления в силу: 14 октября 2026 года Редакция № 2\nТекст.",
			"Согласие на обработку персональных данных",
		);

		assert.equal(parsed.fullTitle, null);
		assert.equal(parsed.published, "14 октября 2026");
		assert.equal(parsed.effective, "14 октября 2026");
		assert.equal(parsed.edition, "Редакция № 2");
	});

	test("«Версия: 2.3» и дата с «г.»", () => {
		const parsed = parseConsent(
			"Дата вступления в силу: 14 октября 2026 г.\nВерсия: 2.3\nТекст.",
			"Файлы куки",
		);

		assert.equal(parsed.effective, "14 октября 2026");
		assert.equal(parsed.edition, "Версия 2.3");
	});

	test("без шапки ничего не выдумывается", () => {
		const parsed = parseConsent("Просто текст.\nЕщё абзац.", "Документ");

		assert.equal(parsed.published, null);
		assert.equal(parsed.effective, null);
		assert.equal(parsed.edition, null);
		assert.equal(parsed.blocks.length, 2);
	});
});

describe("parseConsent: тело", () => {
	test("разделы, пункты, подзаголовки и списки", () => {
		const parsed = parseConsent(
			[
				"1.\tРеквизиты Продавца",
				"•\tОГРН: 1256200006281.",
				"• ИНН: 6200017059.",
				"2. Предмет Оферты",
				"2.1. Продавец обязуется передать Товар.",
				"5.1. Строго необходимые (технические) cookie",
			].join("\n"),
			"Оферта",
		);

		assert.deepEqual(
			parsed.sections.map((s) => [s.id, s.number, s.title]),
			[
				["razdel-1", "1", "Реквизиты Продавца"],
				["razdel-2", "2", "Предмет Оферты"],
			],
		);
		assert.deepEqual(
			parsed.blocks.map((b) => b.type),
			["section", "list", "section", "clause", "subsection"],
		);
		assert.deepEqual(parsed.blocks[1], {
			type: "list",
			items: ["ОГРН: 1256200006281.", "ИНН: 6200017059."],
		});
	});

	test("заголовок, слипшийся с первым пунктом, разделяется", () => {
		const parsed = parseConsent(
			"1. Обработка данных\n2.\tОтветственность сторон 2.1. Оператор не несет ответственности за:",
			"Соглашение",
		);

		assert.equal(parsed.sections[1]?.title, "Ответственность сторон");
		assert.deepEqual(parsed.blocks[2], {
			type: "clause",
			number: "2.1",
			text: "Оператор не несет ответственности за:",
		});
	});

	test("нумерованный шаг внутри раздела не становится разделом", () => {
		const parsed = parseConsent(
			"1. Что такое cookie\n2. Ваши права\n3. Как управлять файлами cookie\n1. Через баннер на Сайте.\n2. Через настройки браузера.\n4. Контакты",
			"Cookie",
		);

		assert.deepEqual(
			parsed.sections.map((s) => s.number),
			["1", "2", "3", "4"],
		);
		assert.deepEqual(parsed.blocks[3], {
			type: "clause",
			number: "1.",
			text: "Через баннер на Сайте.",
		});
	});

	test("запись перечня cookie собирается в одно целое", () => {
		const parsed = parseConsent(
			[
				"• Название: payload-token",
				"Категория: строго необходимая",
				"Срок хранения: 7 дней",
				"•\tНазвание: _ym_uid",
				"Срок хранения: 1 год",
				"Выбор пользователя хранится в браузере.",
			].join("\n"),
			"Cookie",
		);

		assert.deepEqual(parsed.blocks, [
			{
				type: "record",
				fields: [
					{ label: "Название", value: "payload-token" },
					{ label: "Категория", value: "строго необходимая" },
					{ label: "Срок хранения", value: "7 дней" },
				],
			},
			{
				type: "record",
				fields: [
					{ label: "Название", value: "_ym_uid" },
					{ label: "Срок хранения", value: "1 год" },
				],
			},
			{ type: "paragraph", text: "Выбор пользователя хранится в браузере." },
		]);
	});
});

describe("parseRussianDate", () => {
	test("распознаёт дату из шапки", () => {
		assert.deepEqual(
			parseRussianDate("24 октября 2026"),
			new Date(2026, 9, 24),
		);
	});

	test("нераспознанное — null", () => {
		assert.equal(parseRussianDate("с момента публикации"), null);
		assert.equal(parseRussianDate(null), null);
	});
});
