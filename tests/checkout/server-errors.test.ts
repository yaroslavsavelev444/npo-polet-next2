import assert from "node:assert/strict";
import { test } from "node:test";
import {
	filterStaleServerErrors,
	getValueAtPath,
} from "../../src/modules/checkout/lib/server-errors.ts";

/**
 * Живучесть серверных ошибок формы.
 *
 * Клиентские ошибки пересчитываются на каждый рендер и устареть не могут.
 * Серверные — хранятся, поэтому именно они порождают классическую жалобу
 * «я всё исправил, а ошибка висит». Правило одно: ошибка жива ровно до тех
 * пор, пока значение её поля не изменилось с момента отправки.
 *
 * Запуск: pnpm test:checkout
 */

const SNAPSHOT = {
	recipient: { fullName: "Иванов Иван", email: "ivanov@example.com" },
	company: { existingCompanyId: "7" },
	delivery: { address: { house: "10" } },
};

test("ошибка держится, пока значение не изменилось", () => {
	const errors = { "company.existingCompanyId": "Организация не найдена" };

	assert.deepEqual(
		filterStaleServerErrors(errors, SNAPSHOT, structuredClone(SNAPSHOT)),
		errors,
	);
});

test("ошибка гаснет сразу после правки своего поля", () => {
	const current = structuredClone(SNAPSHOT);
	current.company.existingCompanyId = "8";

	assert.deepEqual(
		filterStaleServerErrors(
			{ "company.existingCompanyId": "Организация не найдена" },
			SNAPSHOT,
			current,
		),
		{},
	);
});

test("правка одного поля не гасит ошибки других", () => {
	// Иначе исправление первой ошибки создавало бы иллюзию, что форма готова.
	const current = structuredClone(SNAPSHOT);
	current.recipient.email = "new@example.com";

	const live = filterStaleServerErrors(
		{
			"recipient.email": "Некорректный email",
			"company.existingCompanyId": "Организация не найдена",
		},
		SNAPSHOT,
		current,
	);

	assert.deepEqual(live, {
		"company.existingCompanyId": "Организация не найдена",
	});
});

test("без снимка отправки серверных ошибок нет", () => {
	// Снимок отсутствует до первой отправки и после сброса: показывать
	// ошибку, не относящуюся ни к какой попытке, нельзя.
	assert.deepEqual(
		filterStaleServerErrors(
			{ "recipient.email": "Некорректный email" },
			null,
			SNAPSHOT,
		),
		{},
	);
});

test("вложенный путь сравнивается целиком, а не по первому сегменту", () => {
	const current = structuredClone(SNAPSHOT);
	current.delivery.address.house = "12";

	assert.deepEqual(
		filterStaleServerErrors(
			{ "delivery.address.house": "Дом не найден" },
			SNAPSHOT,
			current,
		),
		{},
	);
});

test("исчезнувшее поле считается изменённым", () => {
	// Например, пользователь снял флаг «заказ от юрлица» — блока company
	// больше нет, и ошибка по нему бессмысленна.
	const current = { ...structuredClone(SNAPSHOT), company: undefined };

	assert.deepEqual(
		filterStaleServerErrors(
			{ "company.existingCompanyId": "Организация не найдена" },
			SNAPSHOT,
			current as unknown as typeof SNAPSHOT,
		),
		{},
	);
});

test("getValueAtPath не падает на отсутствующих ветках", () => {
	assert.equal(getValueAtPath(SNAPSHOT, "recipient.fullName"), "Иванов Иван");
	assert.equal(getValueAtPath(SNAPSHOT, "delivery.address.house"), "10");
	assert.equal(getValueAtPath(SNAPSHOT, "нет.такого.пути"), undefined);
	assert.equal(getValueAtPath(null, "recipient.email"), undefined);
	assert.equal(getValueAtPath(undefined, "a"), undefined);
});
