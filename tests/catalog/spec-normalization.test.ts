import assert from "node:assert/strict";
import { test } from "node:test";
import {
	manufacturerKey,
	parseSpec,
	specNameKey,
} from "../../src/modules/productCatalog/lib/specNormalization.ts";

/**
 * Нормализация характеристик для фасетов каталога: одинаковое по смыслу
 * обязано давать одинаковый ключ, разное — разный.
 *
 * Запуск: pnpm test:catalog
 */

test("регистр, ё, пробелы и единица в названии не меняют ключ характеристики", () => {
	const key = specNameKey("Напряжение питания");
	assert.equal(key, "napryazhenie-pitaniya");
	assert.equal(specNameKey("  напряжение   питания "), key);
	assert.equal(specNameKey("Напряжение питания, В"), key);
	assert.equal(specNameKey("Напряжение питания (В)"), key);
	assert.equal(specNameKey("Масса, кг"), specNameKey("Масса"));
	// Хвост после запятой, не являющийся единицей, — часть названия.
	assert.notEqual(specNameKey("Мощность, пиковая"), specNameKey("Мощность"));
});

test("числа приводятся к базовой единице: одно значение при разном написании", () => {
	const base = parseSpec({ name: "Масса", value: "0.4", unit: "кг" });
	assert.equal(base.valueKey, "0.4kg");
	assert.equal(base.valueNum, 0.4);
	assert.equal(
		parseSpec({ name: "Масса", value: "0,4", unit: "кг" }).valueKey,
		"0.4kg",
	);
	assert.equal(
		parseSpec({ name: "Масса", value: "400", unit: "г" }).valueKey,
		"0.4kg",
	);
	assert.equal(
		parseSpec({ name: "Масса", value: "400 г", unit: "" }).valueKey,
		"0.4kg",
	);
	assert.equal(
		parseSpec({ name: "Масса, кг", value: "0.4", unit: "" }).valueKey,
		"0.4kg",
	);
	assert.equal(
		parseSpec({ name: "Мощность", value: "1 200", unit: "Вт" }).valueNum,
		1200,
	);
	assert.equal(
		parseSpec({ name: "Мощность", value: "1,2", unit: "кВт" }).valueKey,
		"1200w",
	);
});

test("регистр приставки значим: мВт и МВт — разные величины", () => {
	assert.equal(
		parseSpec({ name: "P", value: "5", unit: "мВт" }).valueNum,
		0.005,
	);
	assert.equal(parseSpec({ name: "P", value: "5", unit: "МВт" }).valueNum, 5e6);
	// Строчные «мвт» неоднозначны — единица не распознаётся как известная,
	// и значение не пересчитывается.
	assert.equal(
		parseSpec({ name: "P", value: "5", unit: "мвт" }).unit?.known,
		false,
	);
});

test("не-числа остаются текстом, а не выдуманным числом", () => {
	for (const value of ["до 98", "−40…+55", "900 / 1200 / 2400"]) {
		assert.equal(
			parseSpec({ name: "X", value, unit: "" }).valueNum,
			null,
			value,
		);
	}
	// Знак минуса сохраняется в ключе текстового диапазона.
	assert.notEqual(
		parseSpec({ name: "T", value: "−40…+55", unit: "°C" }).valueKey,
		parseSpec({ name: "T", value: "40…55", unit: "°C" }).valueKey,
	);
});

test("кириллица вперемешку с латиницей в обозначениях не плодит значения", () => {
	const latin = parseSpec({ name: "Степень защиты", value: "IP67" }).valueKey;
	assert.equal(latin, "ip67");
	assert.equal(
		parseSpec({ name: "Степень защиты", value: "IР67" }).valueKey,
		latin,
	);
	assert.equal(
		parseSpec({ name: "Степень защиты", value: "ip 67" }).valueKey,
		"ip-67",
	);
});

test("пустые и служебные значения в фасеты не попадают", () => {
	assert.equal(parseSpec({ name: "X", value: "—" }).valueKey, null);
	assert.equal(parseSpec({ name: "X", value: "  " }).valueKey, null);
	assert.equal(parseSpec({ name: "", value: "5" }).nameKey, null);
});

test("производитель: кавычки, регистр и ё не важны", () => {
	assert.equal(manufacturerKey("НПО «Полёт»"), "npo-polet");
	assert.equal(manufacturerKey('нпо "полет"'), "npo-polet");
	assert.equal(manufacturerKey(""), null);
});
