import assert from "node:assert/strict";
import { test } from "node:test";
import {
	composeAddressLine,
	createEmptyAddress,
	formatAddress,
	hasHouseLevelPrecision,
	normalizeAddress,
} from "../../src/modules/checkout/lib/address.ts";

/**
 * Отображение адреса — единственное место, где встречаются все три поколения
 * данных, живущие в коллекции orders одновременно:
 *
 *  1. перенесённые заказы: весь адрес одной строкой в `street`;
 *  2. заказы после разбиения на поля: city/street/house/apartment;
 *  3. текущие: `fullAddress` + компоненты + идентификаторы ФИАС.
 *
 * Регрессия здесь означает испорченный адрес в уже оформленном заказе,
 * поэтому каждое поколение проверяется отдельно.
 *
 * Запуск: pnpm test:checkout
 */

test("normalizeAddress достраивает частичный адрес до полной модели", () => {
	const address = normalizeAddress({ city: "Москва", street: "Ленина" });

	assert.equal(address.city, "Москва");
	assert.equal(address.street, "Ленина");
	// Отсутствующие поля становятся пустыми строками, а не undefined: форма
	// работает с контролируемыми полями, и undefined превратил бы их в
	// неконтролируемые прямо посреди ввода.
	assert.equal(address.house, "");
	assert.equal(address.apartment, "");
	assert.equal(address.fiasId, "");
	assert.equal(address.country, "Россия");
	assert.equal(address.source, "manual");
});

test("normalizeAddress не падает на null/undefined и на чужих типах", () => {
	assert.deepEqual(normalizeAddress(null), createEmptyAddress());
	assert.deepEqual(normalizeAddress(undefined), createEmptyAddress());

	// Из базы числа приходят числами (например, дом «10» мог быть сохранён
	// как number сторонним импортом) — приводим, а не теряем.
	const address = normalizeAddress({ house: 10, city: null, source: "dadata" });
	assert.equal(address.house, "10");
	assert.equal(address.city, "");
	assert.equal(address.source, "dadata");
});

test("normalizeAddress не даёт стране стать пустой", () => {
	// Пустая страна ломала бы адресную строку и выгрузку перевозчику.
	assert.equal(normalizeAddress({ country: "" }).country, "Россия");
	assert.equal(normalizeAddress({ country: "Казахстан" }).country, "Казахстан");
});

test("source нормализуется до известных значений", () => {
	assert.equal(normalizeAddress({ source: "dadata" }).source, "dadata");
	assert.equal(normalizeAddress({ source: "manual" }).source, "manual");
	// Мусор из старых данных не должен просачиваться в доменную модель.
	assert.equal(normalizeAddress({ source: "kladr" }).source, "manual");
	assert.equal(normalizeAddress({}).source, "manual");
});

test("composeAddressLine собирает адрес до дома в читаемом порядке", () => {
	assert.equal(
		composeAddressLine({
			postalCode: "101000",
			region: "г Москва",
			city: "г Москва",
			street: "ул Ленина",
			house: "10",
			block: "1",
		}),
		"101000, г Москва, г Москва, ул Ленина, д. 10 к. 1",
	);
});

test("composeAddressLine пропускает пустые сегменты без лишних запятых", () => {
	assert.equal(
		composeAddressLine({ city: "Москва", street: "Ленина", house: "10" }),
		"Москва, Ленина, д. 10",
	);
	assert.equal(composeAddressLine({}), "");
	assert.equal(composeAddressLine({ city: "  ", street: null }), "");
});

test("formatAddress: заказ первого поколения (весь адрес в street)", () => {
	// Ровно так выглядят перенесённые заказы. Строка обязана выводиться как
	// есть, без «д.» и прочих префиксов, которых в ней нет.
	const legacy = { street: "г. Москва, ул. Ленина, д. 10, кв. 5" };

	assert.equal(formatAddress(legacy), "г. Москва, ул. Ленина, д. 10, кв. 5");
});

test("formatAddress: заказ второго поколения (разбитые поля)", () => {
	const address = {
		postalCode: "101000",
		city: "Москва",
		street: "ул. Ленина",
		house: "10",
		apartment: "5",
	};

	assert.equal(formatAddress(address), "101000, Москва, ул. Ленина, д. 10");
	assert.equal(
		formatAddress(address, { withUnitDetails: true }),
		"101000, Москва, ул. Ленина, д. 10, кв./офис 5",
	);
});

test("formatAddress: текущий формат — fullAddress имеет приоритет", () => {
	// fullAddress содержит части, которых нет в отдельных полях (округ,
	// район). Собирать строку из компонентов, когда он есть, значит терять их.
	const address = {
		fullAddress: "г Москва, р-н Тверской, ул Ленина, д 10",
		postalCode: "101000",
		city: "г Москва",
		street: "ул Ленина",
		house: "10",
	};

	assert.equal(
		formatAddress(address),
		"101000, г Москва, р-н Тверской, ул Ленина, д 10",
	);
});

test("formatAddress не дублирует индекс, если он уже внутри строки", () => {
	const address = {
		fullAddress: "101000, г Москва, ул Ленина, д 10",
		postalCode: "101000",
	};
	assert.equal(formatAddress(address), "101000, г Москва, ул Ленина, д 10");
});

test("formatAddress добавляет квартиру, подъезд и этаж отдельными сегментами", () => {
	// Данные для курьера принципиально не смешиваются с адресной частью:
	// их нет в справочнике, и перевозчик читает их отдельно.
	const address = {
		fullAddress: "г Москва, ул Ленина, д 10",
		apartment: "42",
		entrance: "2",
		floor: "5",
	};

	assert.equal(
		formatAddress(address, { withUnitDetails: true }),
		"г Москва, ул Ленина, д 10, кв./офис 42, подъезд 2, этаж 5",
	);
	// Без флага (ПВЗ, самовывоз) их быть не должно.
	assert.equal(formatAddress(address), "г Москва, ул Ленина, д 10");
});

test("formatAddress на пустом адресе возвращает пустую строку, а не мусор", () => {
	assert.equal(formatAddress(null), "");
	assert.equal(formatAddress(undefined), "");
	assert.equal(formatAddress({}), "");
	// Ровно этот случай и создаёт «Адрес: , , ,» на странице заказа.
	assert.equal(formatAddress({ city: null, street: null, house: null }), "");
});

test("hasHouseLevelPrecision ориентируется на дом, а не на источник", () => {
	// Адрес, введённый руками, полноценен ровно так же, как выбранный из
	// подсказок: критерий один — известен ли номер дома.
	assert.equal(hasHouseLevelPrecision({ house: "10" }), true);
	assert.equal(hasHouseLevelPrecision({ house: "  " }), false);
	assert.equal(hasHouseLevelPrecision({ street: "ул Ленина" }), false);
});
