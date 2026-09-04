import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildErrorEntries,
	CHECKOUT_FIELD_IDS,
	CHECKOUT_FIELD_ORDER,
	CHECKOUT_FIELDS,
	findFirstErrorTarget,
	summarizeAddressErrors,
} from "../../src/modules/checkout/lib/checkout-fields.ts";

/**
 * Общий блок ошибок оформления заказа.
 *
 * Главные требования, которые здесь фиксируются:
 *  • порядок списка совпадает с порядком разделов формы — иначе «перейти к
 *    полю» бросает пользователя назад по странице;
 *  • в режиме подсказок адрес — ОДНО поле, значит и запись в списке одна, и
 *    ведёт она на реально существующий элемент;
 *  • ни одна ошибка не теряется, даже если её путь реестру незнаком.
 *
 * Запуск: pnpm test:checkout
 */

test("каждый путь из порядка описан в реестре", () => {
	// Расхождение означало бы ошибку, которая есть, но не показывается в
	// сводке — самый неприятный вид: пользователь видит отказ без причины.
	for (const path of CHECKOUT_FIELD_ORDER) {
		assert.ok(CHECKOUT_FIELDS[path], `нет описания для пути ${path}`);
		assert.ok(CHECKOUT_FIELDS[path].label, `нет названия для ${path}`);
		assert.ok(CHECKOUT_FIELDS[path].elementId, `нет id элемента для ${path}`);
	}
});

test("id полей уникальны", () => {
	const ids = Object.values(CHECKOUT_FIELD_IDS);
	assert.equal(new Set(ids).size, ids.length);
});

test("пустой набор ошибок даёт пустой список", () => {
	assert.deepEqual(buildErrorEntries({}), []);
});

test("порядок записей соответствует порядку разделов формы", () => {
	// Ошибки передаются в обратном порядке специально: список обязан
	// упорядочивать их сам, а не полагаться на порядок ключей объекта.
	const entries = buildErrorEntries(
		{
			paymentMethod: "Выберите оплату",
			"recipient.email": "Некорректный email",
			"delivery.transportCompanyId": "Выберите транспортную компанию",
		},
		{ addressManualMode: true },
	);

	assert.deepEqual(
		entries.map((entry) => entry.path),
		["delivery.transportCompanyId", "recipient.email", "paymentMethod"],
	);
});

test("режим подсказок: ошибки адреса схлопываются в одну запись", () => {
	// На странице в этом режиме есть только поле поиска — четыре записи вели
	// бы на несуществующие элементы и выглядели бы как четыре разные проблемы.
	const entries = buildErrorEntries(
		{
			"delivery.address.city": "Укажите город или населённый пункт",
			"delivery.address.street": "Укажите улицу",
			"delivery.address.house": "Укажите номер дома",
			"delivery.address.postalCode": "Индекс должен содержать 6 цифр",
		},
		{ addressManualMode: false },
	);

	assert.equal(entries.length, 1);
	assert.equal(entries[0].label, "Адрес");
	assert.equal(entries[0].elementId, CHECKOUT_FIELD_IDS.addressQuery);
	assert.match(entries[0].message, /населённый пункт/);
	assert.match(entries[0].message, /улицу/);
	assert.match(entries[0].message, /дом/);
});

test("ручной режим: каждая ошибка адреса ведёт к своему полю", () => {
	const entries = buildErrorEntries(
		{
			"delivery.address.city": "Укажите город или населённый пункт",
			"delivery.address.house": "Укажите номер дома",
		},
		{ addressManualMode: true },
	);

	assert.deepEqual(
		entries.map((entry) => entry.elementId),
		[CHECKOUT_FIELD_IDS.addressCity, CHECKOUT_FIELD_IDS.addressHouse],
	);
	assert.deepEqual(
		entries.map((entry) => entry.label),
		["Город", "Дом"],
	);
});

test("незнакомый путь не исчезает бесследно", () => {
	// Сервер может вернуть код, которого реестр ещё не знает (новая проверка
	// бизнес-логики). Молча проглотить такую ошибку — значит показать
	// пользователю форму без единой подсказки, почему заказ не проходит.
	const entries = buildErrorEntries({
		"delivery.customsCode": "Нужен код ТН ВЭД",
	});

	assert.equal(entries.length, 1);
	assert.equal(entries[0].message, "Нужен код ТН ВЭД");
});

test("записи снабжены названием раздела для навигации", () => {
	const entries = buildErrorEntries(
		{ "recipient.phone": "Укажите корректный номер телефона" },
		{ addressManualMode: true },
	);

	assert.equal(entries[0].section, "recipient");
	assert.equal(entries[0].sectionLabel, "Данные получателя");
});

test("findFirstErrorTarget возвращает первое поле по порядку формы", () => {
	const entries = buildErrorEntries(
		{
			"recipient.fullName": "Укажите ФИО получателя",
			"delivery.pickupPointId": "Выберите пункт самовывоза",
		},
		{ addressManualMode: true },
	);

	// Пункт самовывоза расположен на странице выше данных получателя.
	assert.equal(findFirstErrorTarget(entries), CHECKOUT_FIELD_IDS.pickupPoint);
	assert.equal(findFirstErrorTarget([]), null);
});

// ── Сводное сообщение об адресе ─────────────────────────────────────────────

test("сообщение перечисляет именно то, чего не хватает", () => {
	assert.match(
		summarizeAddressErrors({ "delivery.address.house": "Укажите номер дома" }),
		/не хватает дом/,
	);
	assert.match(
		summarizeAddressErrors({
			"delivery.address.street": "Укажите улицу",
			"delivery.address.house": "Укажите номер дома",
		}),
		/улицу, дом/,
	);
});

test("одинокая ошибка индекса объясняется отдельно", () => {
	// Адрес выбран, но индекс не определился: просить «выбрать адрес до дома»
	// здесь бессмысленно — он уже выбран.
	const message = summarizeAddressErrors({
		"delivery.address.postalCode": "Индекс должен содержать 6 цифр",
	});

	assert.match(message, /индекс/i);
	assert.doesNotMatch(message, /не хватает/);
});

test("индекс вместе с прочими пропусками не порождает второе сообщение", () => {
	const message = summarizeAddressErrors({
		"delivery.address.city": "Укажите город или населённый пункт",
		"delivery.address.postalCode": "Индекс должен содержать 6 цифр",
	});

	assert.match(message, /населённый пункт/);
	assert.match(message, /Индекс определится автоматически/);
});
