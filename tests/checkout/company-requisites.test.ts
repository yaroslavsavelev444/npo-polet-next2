import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isCompanyQuerySearchable,
	normalizeCompanyQuery,
} from "../../src/modules/checkout/lib/company-query.ts";
import { validateInn } from "../../src/modules/checkout/lib/validate-inn.ts";
import { validateKpp } from "../../src/modules/checkout/lib/validate-kpp.ts";
import { validateOgrn } from "../../src/modules/checkout/lib/validate-ogrn.ts";

/**
 * Реквизиты плательщика и правило запроса к подсказкам организаций.
 *
 * КПП и ОГРН уходят в счёт: опечатка в них — возвращённый платёж. Правило
 * запроса — главная защита квоты DaData от лишних обращений.
 *
 * Запуск: pnpm test:checkout
 */

test("ИНН юрлица (10 цифр) проверяется по контрольной цифре", () => {
	assert.equal(validateInn("7707083893"), null);
	assert.equal(validateInn(" 7707 083 893 "), null);
	assert.equal(validateInn("7707083894"), "Неверная контрольная сумма ИНН");
});

test("ИНН ИП (12 цифр) проверяется по ОБЕИМ контрольным цифрам", () => {
	assert.equal(validateInn("500100732259"), null);
	// Неверна только вторая контрольная цифра.
	assert.equal(validateInn("500100732250"), "Неверная контрольная сумма ИНН");
	// Неверна только первая: вторая пересчитана под неё и сходится.
	assert.equal(validateInn("500100732266"), "Неверная контрольная сумма ИНН");
});

test("ИНН: пустой, нецифровой и неверной длины отклоняются", () => {
	assert.equal(validateInn(""), "Укажите ИНН");
	assert.equal(validateInn("   "), "Укажите ИНН");
	assert.equal(validateInn("770708389a"), "ИНН должен содержать только цифры");
	assert.equal(validateInn("a770708389"), "ИНН должен содержать только цифры");
	assert.equal(validateInn("77070838931"), "ИНН должен содержать 10 или 12 цифр");
	assert.equal(validateInn("770708389"), "ИНН должен содержать 10 или 12 цифр");
	assert.equal(
		validateInn("7707083893123"),
		"ИНН должен содержать 10 или 12 цифр",
	);
});

test("КПП: пустой допустим, формат проверяется", () => {
	assert.equal(validateKpp(""), null);
	assert.equal(validateKpp("773601001"), null);
	// Причина постановки на учёт может содержать латинские буквы.
	assert.equal(validateKpp("7736AB001"), null);
	assert.equal(validateKpp("7736ab001"), null);
	assert.equal(validateKpp("7736 01 001"), null);
	assert.equal(validateKpp("77360100"), "КПП должен содержать 9 знаков");
	assert.equal(validateKpp("77AB01001"), "Неверный формат КПП");
	assert.equal(validateKpp("A73601001"), "Неверный формат КПП");
	assert.equal(validateKpp("77360100A"), "Неверный формат КПП");
	assert.equal(validateKpp("  773601001  "), null);
});

test("ОГРН и ОГРНИП проверяются по контрольной цифре", () => {
	assert.equal(validateOgrn(""), null);
	assert.equal(validateOgrn("1027700132195"), null);
	assert.equal(validateOgrn("304500116000157"), null);
	assert.equal(validateOgrn(" 1027700132195 "), null);
	// ОГРНИП делится на 13, а не на 11: у этого номера остатки различаются,
	// и деление на 11 дало бы контрольную цифру 3.
	assert.equal(validateOgrn("304500116000005"), null);
	assert.equal(
		validateOgrn("304500116000003"),
		"Неверная контрольная цифра ОГРН",
	);
	assert.equal(
		validateOgrn("1027700132196"),
		"Неверная контрольная цифра ОГРН",
	);
	assert.equal(
		validateOgrn("304500116000158"),
		"Неверная контрольная цифра ОГРН",
	);
	assert.equal(
		validateOgrn("12345"),
		"ОГРН должен содержать 13 цифр (ОГРНИП — 15)",
	);
	assert.equal(
		validateOgrn("10277001321AB"),
		"ОГРН должен содержать только цифры",
	);
	assert.equal(
		validateOgrn("A027700132195"),
		"ОГРН должен содержать только цифры",
	);
});

test("запрос нормализуется: пробелы в ИНН и между словами", () => {
	assert.equal(normalizeCompanyQuery(" 7707 083 893 "), "7707083893");
	assert.equal(normalizeCompanyQuery("ооо   ромашка "), "ооо ромашка");
	assert.equal(normalizeCompanyQuery("а".repeat(400)).length, 300);
});

test("по неполному ИНН запрос не отправляется", () => {
	assert.equal(isCompanyQuerySearchable("770708389"), false);
	assert.equal(isCompanyQuerySearchable("7707083893"), true);
	assert.equal(isCompanyQuerySearchable("1027700132195"), true);
	assert.equal(isCompanyQuerySearchable("ро"), false);
	assert.equal(isCompanyQuerySearchable("ром"), true);
	// Смешанный запрос — это название («1С»), а не ИНН.
	assert.equal(isCompanyQuerySearchable("1с б"), true);
});
