import assert from "node:assert/strict";
import { test } from "node:test";
import { productRequestSchema } from "../../src/modules/contact/schemas/product-request.schema.ts";

/**
 * Заявка на недоступный товар: та же схема работает в форме и на сервере,
 * поэтому всё, что она пропускает, дойдёт до базы.
 *
 * Запуск: pnpm test:contact
 */

const VALID = {
	productId: "42",
	name: "Иван",
	phone: "+7 (999) 123-45-67",
	quantity: "10",
	comment: "",
	consent: true,
};

test("корректная заявка проходит, количество приводится к числу", () => {
	const parsed = productRequestSchema.safeParse(VALID);
	assert.ok(parsed.success);
	assert.equal(parsed.data.quantity, 10);
});

test("без согласия на обработку ПДн заявка не проходит", () => {
	const parsed = productRequestSchema.safeParse({ ...VALID, consent: false });
	assert.ok(!parsed.success);
	assert.deepEqual(parsed.error.issues[0].path, ["consent"]);
});

test("телефон обязателен и должен быть полным российским номером", () => {
	for (const phone of ["", "+7 (999) 123-45", "12345"]) {
		const parsed = productRequestSchema.safeParse({ ...VALID, phone });
		assert.ok(!parsed.success, phone);
		assert.deepEqual(parsed.error.issues[0].path, ["phone"]);
	}
	assert.ok(
		productRequestSchema.safeParse({ ...VALID, phone: "89991234567" }).success,
	);
});

test("количество — целое от 1 до 100 000", () => {
	for (const quantity of ["0", "-3", "2.5", "", "abc", "100001"]) {
		const parsed = productRequestSchema.safeParse({ ...VALID, quantity });
		assert.ok(!parsed.success, quantity);
		assert.deepEqual(parsed.error.issues[0].path, ["quantity"]);
	}
});

test("товар указывается числовым id, имя — не короче двух символов", () => {
	assert.ok(!productRequestSchema.safeParse({ ...VALID, productId: "x" }).success);
	assert.ok(!productRequestSchema.safeParse({ ...VALID, productId: "" }).success);
	assert.ok(!productRequestSchema.safeParse({ ...VALID, name: " И " }).success);
});
