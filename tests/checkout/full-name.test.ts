import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isValidFullName,
	validateFullName,
} from "../../src/modules/checkout/lib/validate-full-name.ts";

/**
 * ФИО получателя — строгая проверка «фамилия + имя (+ отчество)».
 *
 * По этому ФИО перевозчик выдаёт груз по паспорту: логин или ник вместо
 * имени — это заказ, который невозможно получить.
 *
 * Запуск: pnpm test:checkout
 */

test("фамилия и имя, с отчеством и без, проходят", () => {
	assert.equal(validateFullName("Иванов Иван"), null);
	assert.equal(validateFullName("Иванов Иван Иванович"), null);
	assert.equal(validateFullName("Ёлкин Пётр"), null);
	assert.equal(validateFullName("Петров-Водкин Кузьма Сергеевич"), null);
});

test("лишние пробелы не мешают", () => {
	assert.equal(validateFullName("  Иванов   Иван  "), null);
	assert.equal(validateFullName("Иванов\tИван"), null);
});

test("пустое, одно слово и больше трёх слов отклоняются с понятной причиной", () => {
	assert.equal(validateFullName(""), "Укажите ФИО получателя");
	assert.equal(validateFullName("   "), "Укажите ФИО получателя");
	assert.equal(validateFullName("Иванов"), "Укажите фамилию и имя полностью");
	assert.equal(
		validateFullName("Иванов Иван Иванович Младший"),
		"Слишком много слов — укажите фамилию, имя и отчество",
	);
});

test("не-ФИО отклоняется, даже если плохо только одно слово", () => {
	const invalid = [
		"Иванов ivan",
		"ivanov Иван",
		"иванов Иван",
		"xИванов Иван",
		"Иванов1 Иван",
		"Иванов И.",
		"Петров-водкин Иван",
		"Петров-В Иван",
		"Петров- Иван",
	];
	for (const name of invalid) {
		assert.match(validateFullName(name) ?? "", /кириллицей/, name);
	}
});

test("isValidFullName — булева обёртка той же проверки", () => {
	assert.equal(isValidFullName("Иванов Иван"), true);
	assert.equal(isValidFullName("admin"), false);
});
