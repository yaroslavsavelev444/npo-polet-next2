import assert from "node:assert/strict";
import { test } from "node:test";
import {
	getOrderContact,
	resolveOrderContact,
} from "../../src/modules/orders/lib/order-contact.ts";

/**
 * Разбор телефонов заказа — общий контракт оформления, хука коллекции,
 * страницы заказа, писем и админки.
 *
 * Здесь фиксируются два обязательства, ради которых модуль и написан:
 *  • менеджеру всегда достаётся ОДИН однозначный номер, и он никогда не
 *    указывает на человека, чьего телефона в заказе нет;
 *  • заказы, оформленные до разделения номеров, продолжают читаться — без
 *    миграции данных и без пустых полей.
 *
 * Живёт в tests/checkout, потому что этим контрактом заканчивается путь
 * данных формы оформления. Запуск: pnpm test:checkout
 */

const CUSTOMER = "+79991234567";
const RECIPIENT = "+79997654321";

// ── Новая модель: два номера и явный выбор ──────────────────────────────────

test("выбран свой номер — звонить заказчику", () => {
	const contact = resolveOrderContact({
		customerPhone: CUSTOMER,
		recipientPhone: RECIPIENT,
		preferred: "customer",
	});

	assert.equal(contact.phone, CUSTOMER);
	assert.equal(contact.owner, "customer");
	assert.equal(contact.hasSeparateRecipientPhone, true);
});

test("выбран номер получателя — звонить получателю", () => {
	const contact = resolveOrderContact({
		customerPhone: CUSTOMER,
		recipientPhone: RECIPIENT,
		preferred: "recipient",
	});

	assert.equal(contact.phone, RECIPIENT);
	assert.equal(contact.owner, "recipient");
});

test("получателя нет — остаётся номер заказчика", () => {
	const contact = resolveOrderContact({
		customerPhone: CUSTOMER,
		recipientPhone: "",
		preferred: "customer",
	});

	assert.equal(contact.phone, CUSTOMER);
	assert.equal(contact.hasSeparateRecipientPhone, false);
});

test("совпадающие номера не считаются отдельным получателем", () => {
	// Иначе интерфейс предлагал бы выбор между двумя одинаковыми числами.
	const contact = resolveOrderContact({
		customerPhone: CUSTOMER,
		recipientPhone: CUSTOMER,
		preferred: "customer",
	});

	assert.equal(contact.hasSeparateRecipientPhone, false);
});

test("номера очищаются от пробелов по краям", () => {
	const contact = resolveOrderContact({
		customerPhone: `  ${CUSTOMER} `,
		preferred: "customer",
	});

	assert.equal(contact.phone, CUSTOMER);
});

// ── Инвариант: выбранного номера не может не быть ───────────────────────────

test("выбор получателя без его номера переносится на заказчика", () => {
	// Сюда приводит правка заказа в админке (удалили телефон получателя) и
	// обход формы. Пустое «куда звонить» заставило бы менеджера расследовать
	// заказ — ровно то, что эта модель обязана исключить.
	const contact = resolveOrderContact({
		customerPhone: CUSTOMER,
		recipientPhone: "",
		preferred: "recipient",
	});

	assert.equal(contact.phone, CUSTOMER);
	assert.equal(contact.owner, "customer");
});

test("выбор заказчика без его номера переносится на получателя", () => {
	const contact = resolveOrderContact({
		customerPhone: "",
		recipientPhone: RECIPIENT,
		preferred: "customer",
	});

	assert.equal(contact.phone, RECIPIENT);
	assert.equal(contact.owner, "recipient");
});

test("неизвестное значение выбора не ломает разбор", () => {
	const contact = resolveOrderContact({
		customerPhone: CUSTOMER,
		recipientPhone: RECIPIENT,
		preferred: "manager",
	});

	assert.equal(contact.owner, "customer");
	assert.equal(contact.phone, CUSTOMER);
});

test("заказ без единого номера не выдумывает контакт", () => {
	// Обезличенный после удаления аккаунта заказ.
	const contact = resolveOrderContact({});

	assert.equal(contact.phone, "");
	assert.equal(contact.owner, null);
});

// ── Заказы, оформленные до разделения номеров ───────────────────────────────

test("исторический заказ: единственный номер принадлежит получателю", () => {
	// Миграции данных нет: у старого заказа заполнен только recipient.phone.
	// Он и использовался для связи, поэтому такая трактовка не выдумывает
	// данных, а описывает то, что уже было.
	const contact = getOrderContact({
		recipient: { phone: RECIPIENT },
		contact: null,
	});

	assert.equal(contact.phone, RECIPIENT);
	assert.equal(contact.owner, "recipient");
	assert.equal(contact.customerPhone, "");
});

test("исторический заказ читается и при полностью отсутствующих полях", () => {
	assert.doesNotThrow(() => getOrderContact({}));
	assert.equal(getOrderContact({}).phone, "");
});

test("сохранённый в заказе номер связи приоритетнее пересчёта", () => {
	// Снимок в contact.phone — это то, что видит менеджер. Показывать
	// покупателю другой номер недопустимо.
	const contact = getOrderContact({
		recipient: { phone: RECIPIENT },
		contact: {
			customerPhone: CUSTOMER,
			preferred: "customer",
			phone: CUSTOMER,
		},
	});

	assert.equal(contact.phone, CUSTOMER);
	assert.equal(contact.owner, "customer");
	assert.equal(contact.recipientPhone, RECIPIENT);
});
