import assert from "node:assert/strict";
import { test } from "node:test";
import {
	isCompanyQuerySearchable,
	normalizeCompanyQuery,
} from "../../src/modules/checkout/lib/company-query.ts";
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

test("КПП: пустой допустим, формат проверяется", () => {
	assert.equal(validateKpp(""), null);
	assert.equal(validateKpp("773601001"), null);
	// Причина постановки на учёт может содержать латинские буквы.
	assert.equal(validateKpp("7736AB001"), null);
	assert.equal(validateKpp("7736ab001"), null);
	assert.equal(validateKpp("7736 01 001"), null);
	assert.equal(validateKpp("77360100"), "КПП должен содержать 9 знаков");
	assert.equal(validateKpp("77AB01001"), "Неверный формат КПП");
});

test("ОГРН и ОГРНИП проверяются по контрольной цифре", () => {
	assert.equal(validateOgrn(""), null);
	assert.equal(validateOgrn("1027700132195"), null);
	assert.equal(validateOgrn("304500116000157"), null);
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
