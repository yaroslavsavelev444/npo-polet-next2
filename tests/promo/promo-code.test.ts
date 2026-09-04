import assert from "node:assert/strict";
import { test } from "node:test";
import {
	formatRub,
	isValidPromoCodeFormat,
	normalizePromoCode,
	roundMoney,
} from "../../src/modules/promo/lib/promo-code.ts";

/**
 * Канонический вид промокода.
 *
 * Нормализацию выполняют три независимых места — поле ввода, серверное
 * действие и хук коллекции при сохранении в админке. Разойдись они хоть в
 * одном символе, администратор завёл бы «summer-24», покупатель ввёл бы
 * «SUMMER-24», и код не нашёлся бы ни по одному запросу. Тесты фиксируют
 * общий для всех троих контракт.
 *
 * Запуск: pnpm test:promo
 */

test("код приводится к верхнему регистру", () => {
	assert.equal(normalizePromoCode("summer24"), "SUMMER24");
});

test("пробелы по краям убираются", () => {
	assert.equal(normalizePromoCode("  SUMMER24  "), "SUMMER24");
});

test("убираются и пробелы ВНУТРИ кода", () => {
	// Код, скопированный из письма или мессенджера, регулярно приезжает с
	// неразрывным пробелом внутри или переносом строки на конце.
	assert.equal(normalizePromoCode("SUM MER 24\n"), "SUMMER24");
});

test("нормализация идемпотентна", () => {
	const once = normalizePromoCode(" summer 24 ");
	assert.equal(normalizePromoCode(once), once);
});

test("допустимые символы: латиница, цифры, дефис, подчёркивание", () => {
	assert.equal(isValidPromoCodeFormat("SUMMER-24_A"), true);
});

test("кириллица недопустима", () => {
	// Коды печатают на упаковке и диктуют по телефону: кириллическая «С» и
	// латинская «C» неотличимы ни на слух, ни на глаз.
	assert.equal(isValidPromoCodeFormat(normalizePromoCode("СУММЕР")), false);
});

test("слишком короткий код отвергается", () => {
	assert.equal(isValidPromoCodeFormat("AB"), false);
	assert.equal(isValidPromoCodeFormat("ABC"), true);
});

test("слишком длинный код отвергается", () => {
	assert.equal(isValidPromoCodeFormat("A".repeat(32)), true);
	assert.equal(isValidPromoCodeFormat("A".repeat(33)), false);
});

test("пустая строка не является кодом", () => {
	assert.equal(isValidPromoCodeFormat(""), false);
	assert.equal(isValidPromoCodeFormat(normalizePromoCode("   ")), false);
});

test("пробелы и служебные символы недопустимы", () => {
	assert.equal(isValidPromoCodeFormat("SUM MER"), false);
	assert.equal(isValidPromoCodeFormat("SUM%MER"), false);
});

// ── Деньги ──────────────────────────────────────────────────────────────────

test("округление до копеек снимает погрешность double", () => {
	assert.equal(roundMoney(0.1 + 0.2), 0.3);
	assert.equal(roundMoney(33.0165), 33.02);
});

test("формат суммы — целые рубли с символом валюты", () => {
	assert.equal(formatRub(1500).replace(/ /gu, " "), "1 500 ₽");
	assert.equal(formatRub(999.6).replace(/ /gu, " "), "1 000 ₽");
});
