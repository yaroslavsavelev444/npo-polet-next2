import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyAddress } from "../../src/modules/checkout/lib/address.ts";
import { validateCheckout } from "../../src/modules/checkout/lib/checkout-schema.ts";
import type { CheckoutSubmitInput } from "../../src/modules/checkout/types/index.ts";

/**
 * Схема оформления заказа — общий контракт клиента и сервера.
 *
 * Тесты фиксируют ровно то, что отличает три сценария получения друг от
 * друга. Ошибка в этом месте либо блокирует оформление корректного заказа,
 * либо пропускает заказ, который потом невозможно доставить.
 *
 * Запуск: pnpm test:checkout
 */

const VALID_RECIPIENT = {
	fullName: "Иванов Иван Иванович",
	phone: "+79991234567",
	email: "ivanov@example.com",
	saveRecipient: false,
};

function selfPickup(overrides: Partial<CheckoutSubmitInput> = {}) {
	return {
		recipient: VALID_RECIPIENT,
		delivery: {
			method: "self_pickup" as const,
			pickupPointId: "1",
			saveAddress: false,
		},
		paymentMethod: "self_pickup_cash" as const,
		...overrides,
	};
}

function courier(addressOverrides: Record<string, string> = {}) {
	return {
		recipient: VALID_RECIPIENT,
		delivery: {
			method: "door_to_door" as const,
			transportCompanyId: "3",
			saveAddress: false,
			address: {
				...createEmptyAddress(),
				fullAddress: "г Москва, ул Ленина, д 10",
				city: "г Москва",
				street: "ул Ленина",
				house: "10",
				postalCode: "101000",
				source: "dadata" as const,
				...addressOverrides,
			},
		},
		paymentMethod: "invoice" as const,
	};
}

function pickupPoint(addressOverrides: Record<string, string> = {}) {
	return {
		recipient: VALID_RECIPIENT,
		delivery: {
			method: "pickup_point" as const,
			transportCompanyId: "3",
			saveAddress: false,
			address: {
				...createEmptyAddress(),
				city: "г Казань",
				street: "ул Баумана",
				house: "5",
				...addressOverrides,
			},
		},
		paymentMethod: "invoice" as const,
	};
}

// ── Happy paths по каждому способу получения ────────────────────────────────

test("самовывоз: пункт выдачи — единственное требование", () => {
	assert.deepEqual(validateCheckout(selfPickup()), {});
});

test("курьер: адрес до дома + индекс + перевозчик", () => {
	assert.deepEqual(validateCheckout(courier()), {});
});

test("ПВЗ: адрес пункта + перевозчик, индекс не требуется", () => {
	// Индекс перевозчику для ПВЗ не нужен: пункт он определяет сам.
	assert.deepEqual(validateCheckout(pickupPoint()), {});
});

test("курьер: адрес, введённый вручную, валиден без идентификаторов ФИАС", () => {
	// Иначе ручной ввод был бы декоративным: DaData не знает новостроек,
	// а её дневная квота может закончиться.
	const manual = courier({ source: "manual", fiasId: "", fullAddress: "" });
	assert.deepEqual(validateCheckout(manual), {});
});

// ── Требования, специфичные для способа получения ───────────────────────────

test("самовывоз не требует адреса вовсе", () => {
	const input = selfPickup();
	// Адреса нет вовсе — не пустой объект, а отсутствующее поле.
	(input.delivery as { address?: unknown }).address = undefined;
	assert.deepEqual(validateCheckout(input), {});
});

test("самовывоз без пункта выдачи — ошибка ровно на этом поле", () => {
	const input = selfPickup();
	input.delivery.pickupPointId = undefined as unknown as string;

	assert.deepEqual(validateCheckout(input), {
		"delivery.pickupPointId": "Выберите пункт самовывоза",
	});
});

test("курьер без адреса: ошибки на каждом обязательном компоненте", () => {
	const errors = validateCheckout(
		courier({
			city: "",
			street: "",
			house: "",
			postalCode: "",
			fullAddress: "",
		}),
	);

	assert.equal(
		errors["delivery.address.city"],
		"Укажите город или населённый пункт",
	);
	assert.equal(errors["delivery.address.street"], "Укажите улицу");
	assert.equal(errors["delivery.address.house"], "Укажите номер дома");
	assert.equal(
		errors["delivery.address.postalCode"],
		"Индекс должен содержать 6 цифр",
	);
});

test("курьер: сельский адрес без города проходит по населённому пункту", () => {
	// Регрессия: раньше проверялся только `city`, и корректный адрес в
	// деревне отклонялся целиком.
	const errors = validateCheckout(
		courier({
			city: "",
			settlement: "д Юдино",
			street: "ул Лесная",
			house: "3",
		}),
	);

	assert.equal(errors["delivery.address.city"], undefined);
});

test("курьер: индекс обязан быть шестизначным", () => {
	for (const postalCode of ["", "1010", "10100a", "1010000"]) {
		const errors = validateCheckout(courier({ postalCode }));
		assert.equal(
			errors["delivery.address.postalCode"],
			"Индекс должен содержать 6 цифр",
			`индекс "${postalCode}" должен быть отклонён`,
		);
	}
	assert.equal(
		validateCheckout(courier({ postalCode: "101000" }))[
			"delivery.address.postalCode"
		],
		undefined,
	);
});

test("ПВЗ без индекса валиден, а без дома — нет", () => {
	assert.equal(
		validateCheckout(pickupPoint({ postalCode: "" }))[
			"delivery.address.postalCode"
		],
		undefined,
	);
	assert.equal(
		validateCheckout(pickupPoint({ house: "" }))["delivery.address.house"],
		"Укажите номер дома",
	);
});

test("курьер и ПВЗ без транспортной компании — ошибка", () => {
	for (const build of [courier, pickupPoint]) {
		const input = build();
		input.delivery.transportCompanyId = undefined as unknown as string;
		assert.equal(
			validateCheckout(input)["delivery.transportCompanyId"],
			"Выберите транспортную компанию",
		);
	}
});

// ── Получатель ──────────────────────────────────────────────────────────────

test("ФИО: логин вместо ФИО не проходит", () => {
	for (const fullName of [
		"",
		"ivanov",
		"Иван",
		"Иванов Иван Иванович Петрович",
	]) {
		const input = selfPickup();
		input.recipient = { ...VALID_RECIPIENT, fullName };
		assert.ok(
			validateCheckout(input)["recipient.fullName"],
			`ФИО "${fullName}" должно быть отклонено`,
		);
	}
});

test("телефон проверяется в каноническом формате E.164", () => {
	// Форма присылает уже нормализованный номер; маска остаётся на клиенте.
	const input = selfPickup();
	input.recipient = { ...VALID_RECIPIENT, phone: "+7 (999) 123-45-67" };
	assert.equal(
		validateCheckout(input)["recipient.phone"],
		"Укажите корректный номер телефона",
	);

	input.recipient = { ...VALID_RECIPIENT, phone: "" };
	assert.ok(validateCheckout(input)["recipient.phone"]);
});

test("некорректный email отклоняется", () => {
	const input = selfPickup();
	input.recipient = { ...VALID_RECIPIENT, email: "не-почта" };
	assert.equal(
		validateCheckout(input)["recipient.email"],
		"Некорректный email",
	);
});

// ── Совместимость оплаты и доставки ─────────────────────────────────────────

test("оплата при самовывозе недоступна для доставки", () => {
	for (const build of [courier, pickupPoint]) {
		const input = build();
		input.paymentMethod = "self_pickup_cash" as never;
		assert.equal(
			validateCheckout(input).paymentMethod,
			"Для выбранного способа доставки доступна только оплата по счету",
		);
	}
});

test("при самовывозе доступны все три способа оплаты", () => {
	for (const paymentMethod of [
		"invoice",
		"self_pickup_card",
		"self_pickup_cash",
	] as const) {
		const input = selfPickup({ paymentMethod });
		assert.deepEqual(validateCheckout(input), {}, paymentMethod);
	}
});

// ── Организация ─────────────────────────────────────────────────────────────

test("заказ от юрлица без реквизитов — ошибки по каждому полю", () => {
	const input = selfPickup({
		company: { isCompany: true, saveCompany: false },
	});
	const errors = validateCheckout(input);

	assert.equal(errors["company.companyName"], "Укажите название компании");
	assert.equal(errors["company.legalAddress"], "Укажите юридический адрес");
	assert.equal(errors["company.taxNumber"], "Укажите ИНН");
});

test("выбранная сохранённая организация снимает требования к реквизитам", () => {
	const input = selfPickup({
		company: { isCompany: true, existingCompanyId: "7", saveCompany: false },
	});
	assert.deepEqual(validateCheckout(input), {});
});

test("выключенный флаг юрлица не порождает ошибок организации", () => {
	const input = selfPickup({
		company: { isCompany: false, saveCompany: false },
	});
	assert.deepEqual(validateCheckout(input), {});
});

test("некорректный ИНН отклоняется по контрольной сумме", () => {
	const input = selfPickup({
		company: {
			isCompany: true,
			companyName: "ООО Ромашка",
			legalAddress: "г Москва, ул Ленина, д 1",
			taxNumber: "1234567890",
			saveCompany: false,
		},
	});
	assert.ok(validateCheckout(input)["company.taxNumber"]);
});

// ── Несколько ошибок одновременно ───────────────────────────────────────────

test("возвращаются ВСЕ ошибки формы, а не первая", () => {
	// Показ одной ошибки за раз — главная причина, по которой пользователь не
	// понимает, сколько ещё осталось исправить.
	const input = {
		recipient: { fullName: "", phone: "", email: "", saveRecipient: false },
		delivery: {
			method: "door_to_door" as const,
			saveAddress: false,
			address: createEmptyAddress(),
		},
		paymentMethod: "self_pickup_cash" as const,
	};

	const errors = validateCheckout(input);

	assert.ok(Object.keys(errors).length >= 8, JSON.stringify(errors, null, 2));
	assert.ok(errors["recipient.fullName"]);
	assert.ok(errors["recipient.phone"]);
	assert.ok(errors["recipient.email"]);
	assert.ok(errors["delivery.address.city"]);
	assert.ok(errors["delivery.address.street"]);
	assert.ok(errors["delivery.address.house"]);
	assert.ok(errors["delivery.address.postalCode"]);
	assert.ok(errors["delivery.transportCompanyId"]);
	assert.ok(errors.paymentMethod);
});

test("на одно поле приходится ровно одно сообщение", () => {
	const errors = validateCheckout({
		recipient: { fullName: "", phone: "", email: "", saveRecipient: false },
		delivery: { method: "self_pickup" as const, saveAddress: false },
		paymentMethod: "invoice" as const,
	});

	for (const message of Object.values(errors)) {
		assert.equal(typeof message, "string");
	}
});

// ── Устойчивость к мусору ───────────────────────────────────────────────────

test("полностью некорректный ввод не бросает исключение", () => {
	// Сюда попадает только обход формы, но падение Server Action означало бы
	// 500 вместо понятного ответа.
	assert.doesNotThrow(() => validateCheckout(null));
	assert.doesNotThrow(() => validateCheckout({}));
	assert.doesNotThrow(() =>
		validateCheckout({ delivery: { method: "почтой" } }),
	);
	assert.ok(Object.keys(validateCheckout({})).length > 0);
});

test("адрес с лишними полями не ломает разбор", () => {
	// Схема Payload может обрасти полями раньше, чем форма.
	const input = courier();
	(input.delivery.address as Record<string, unknown>).unknownField = "x";
	assert.deepEqual(validateCheckout(input), {});
});
