import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	checkoutSchema,
	collectFieldErrors,
	validateCheckout,
} from "../../src/modules/checkout/lib/checkout-schema.ts";

/**
 * Граничные случаи схемы оформления, найденные мутационным тестированием:
 * умолчания разбора, нормализация реквизитов, точные тексты и код ошибок,
 * границы длин, пробелы вместо значений, сборка карты ошибок.
 *
 * Запуск: pnpm test:checkout (и pnpm test:mutation)
 */

const base = {
	customer: { phone: "+79991234567" },
	recipient: {
		fullName: "Иванов Иван Иванович",
		phone: "",
		email: "ivanov@example.com",
		saveRecipient: false,
	},
	contactPreference: "customer" as const,
	delivery: {
		method: "self_pickup" as const,
		pickupPointId: "1",
		saveAddress: false,
	},
	paymentMethod: "self_pickup_cash" as const,
};

const courier = (address: Record<string, string>, extra = {}) => ({
	...base,
	delivery: {
		method: "door_to_door" as const,
		transportCompanyId: "3",
		saveAddress: false,
		address: {
			city: "г Москва",
			street: "ул Ленина",
			house: "10",
			postalCode: "101000",
			...address,
		},
		...extra,
	},
	paymentMethod: "invoice" as const,
});

const company = (patch: Record<string, unknown>) => ({
	...base,
	company: {
		isCompany: true,
		companyName: "ООО «Полёт»",
		legalAddress: "г Рязань, ул Строителей, 39",
		taxNumber: "7707083893",
		saveCompany: false,
		...patch,
	},
});

/** Все issues схемы — с кодом, путём и текстом. */
function issues(input: unknown) {
	const parsed = checkoutSchema.safeParse(input);
	return parsed.success
		? []
		: parsed.error.issues.map((i) => ({
				code: i.code,
				path: i.path.join("."),
				message: i.message,
			}));
}

describe("разбор: умолчания и нормализация", () => {
	test("минимальный ручной адрес дополняется умолчаниями", () => {
		const parsed = checkoutSchema.parse(courier({}));
		const address = parsed.delivery.address;
		assert.equal(address?.country, "Россия");
		assert.equal(address?.source, "manual");
		assert.equal(address?.region, "");
		assert.equal(address?.apartment, "");
		assert.equal(parsed.recipient.phone, "");
	});

	test("ФИО обрезается, КПП и ОГРН — без пробелов, КПП в верхнем регистре", () => {
		const parsed = checkoutSchema.parse({
			...company({ kpp: " 7736 ab 001 ", ogrn: " 1027700132195 " }),
			recipient: { ...base.recipient, fullName: "  Иванов Иван  " },
		});
		assert.equal(parsed.recipient.fullName, "Иванов Иван");
		assert.equal(parsed.company?.ogrn, "1027700132195");
		// КПП с буквой — формат «NNNNPPNNN» допускает латиницу в 5–6 позиции.
		assert.equal(parsed.company?.kpp, "7736AB001");
	});

	test("без получателя без телефона — пустая строка, а не undefined", () => {
		const { phone: _omit, ...recipient } = base.recipient;
		assert.equal(
			checkoutSchema.parse({ ...base, recipient }).recipient.phone,
			"",
		);
	});
});

describe("границы длин", () => {
	test("комментарии: 1000 — можно, 1001 — нельзя", () => {
		const ok = "x".repeat(1000);
		const long = "x".repeat(1001);
		assert.deepEqual(validateCheckout({ ...base, notes: ok }), {});
		assert.ok("notes" in validateCheckout({ ...base, notes: long }));
		assert.deepEqual(
			validateCheckout({ ...base, delivery: { ...base.delivery, notes: ok } }),
			{},
		);
		assert.ok(
			"delivery.notes" in
				validateCheckout({
					...base,
					delivery: { ...base.delivery, notes: long },
				}),
		);
	});
});

describe("ошибки superRefine: код, путь и текст", () => {
	test("промокод неверного вида", () => {
		assert.deepEqual(issues({ ...base, promoCode: "!!" }), [
			{
				code: "custom",
				path: "promoCode",
				message: "Промокод не найден или больше не действует",
			},
		]);
		assert.deepEqual(issues({ ...base, promoCode: "   " }), []);
	});

	test("ФИО и телефон получателя", () => {
		const fio = issues({
			...base,
			recipient: { ...base.recipient, fullName: "Иван" },
		});
		assert.equal(fio[0].code, "custom");
		assert.equal(fio[0].path, "recipient.fullName");

		assert.deepEqual(
			issues({ ...base, recipient: { ...base.recipient, phone: " +7999 " } }),
			[
				{
					code: "custom",
					path: "recipient.phone",
					message: "Укажите корректный номер телефона получателя",
				},
			],
		);
		// Пробелы вокруг корректного номера — не ошибка.
		assert.deepEqual(
			issues({
				...base,
				recipient: { ...base.recipient, phone: " +79997654321 " },
			}),
			[],
		);
		assert.deepEqual(
			issues({
				...base,
				contactPreference: "recipient",
				recipient: { ...base.recipient, phone: "   " },
			}),
			[
				{
					code: "custom",
					path: "contactPreference",
					message:
						"Укажите телефон получателя или выберите для связи свой номер",
				},
			],
		);
	});

	test("адрес: пробелы вместо значений — как пусто", () => {
		const errors = issues(
			courier({
				city: "  ",
				settlement: " ",
				street: " ",
				house: " ",
				postalCode: " ",
			}),
		);
		assert.deepEqual(errors, [
			{
				code: "custom",
				path: "delivery.address.city",
				message: "Укажите город или населённый пункт",
			},
			{
				code: "custom",
				path: "delivery.address.street",
				message: "Укажите улицу",
			},
			{
				code: "custom",
				path: "delivery.address.house",
				message: "Укажите номер дома",
			},
			{
				code: "custom",
				path: "delivery.address.postalCode",
				message: "Индекс должен содержать 6 цифр",
			},
		]);
	});

	test("адрес: две буквы — уже достаточно; одна — нет; посёлок вместо города", () => {
		assert.deepEqual(issues(courier({ city: "Ош", street: "ул" })), []);
		assert.equal(
			issues(courier({ city: "О" }))[0]?.path,
			"delivery.address.city",
		);
		assert.deepEqual(issues(courier({ city: "", settlement: "Ям" })), []);
		assert.equal(issues(courier({ city: "", settlement: "Я" })).length, 1);
		assert.equal(
			issues(courier({ street: "у" }))[0]?.path,
			"delivery.address.street",
		);
		// Индекс с пробелами по краям — нормален.
		assert.deepEqual(issues(courier({ postalCode: " 101000 " })), []);
	});

	test("ПВЗ: свой текст про город, индекс не нужен", () => {
		const errors = issues({
			...courier({ city: "", postalCode: "" }),
			delivery: {
				method: "pickup_point",
				transportCompanyId: "3",
				saveAddress: false,
				address: { city: "", street: "ул Ленина", house: "1", postalCode: "" },
			},
		});
		assert.deepEqual(errors, [
			{
				code: "custom",
				path: "delivery.address.city",
				message: "Укажите город назначения",
			},
		]);
	});

	test("доставка: без перевозчика, без адреса вовсе; самовывоз без пункта", () => {
		const noCarrier = issues(courier({}, { transportCompanyId: undefined }));
		assert.deepEqual(noCarrier, [
			{
				code: "custom",
				path: "delivery.transportCompanyId",
				message: "Выберите транспортную компанию",
			},
		]);
		const noAddress = issues({
			...courier({}),
			delivery: {
				method: "door_to_door",
				transportCompanyId: "3",
				saveAddress: false,
			},
		});
		assert.deepEqual(
			noAddress.map((i) => i.path),
			[
				"delivery.address.city",
				"delivery.address.street",
				"delivery.address.house",
				"delivery.address.postalCode",
			],
		);
		assert.deepEqual(
			issues({
				...base,
				delivery: { method: "self_pickup", saveAddress: false },
			}),
			[
				{
					code: "custom",
					path: "delivery.pickupPointId",
					message: "Выберите пункт самовывоза",
				},
			],
		);
	});

	test("оплата на месте — только при самовывозе", () => {
		assert.deepEqual(
			issues({ ...courier({}), paymentMethod: "self_pickup_card" }),
			[
				{
					code: "custom",
					path: "paymentMethod",
					message:
						"Для выбранного способа доставки доступна только оплата по счету",
				},
			],
		);
	});

	test("компания: пробелы вместо названия и адреса, нет ИНН", () => {
		assert.deepEqual(
			issues(company({ companyName: "  ", legalAddress: " ", taxNumber: "" })),
			[
				{
					code: "custom",
					path: "company.companyName",
					message: "Укажите название компании",
				},
				{
					code: "custom",
					path: "company.legalAddress",
					message: "Укажите юридический адрес",
				},
				{ code: "custom", path: "company.taxNumber", message: "Укажите ИНН" },
			],
		);
	});

	test("компания: неверные ИНН, КПП, ОГРН — у каждого свой путь", () => {
		const errors = issues(
			company({ taxNumber: "7707083890", kpp: "12", ogrn: "123" }),
		);
		assert.deepEqual(
			errors.map((i) => [i.code, i.path]),
			[
				["custom", "company.taxNumber"],
				["custom", "company.kpp"],
				["custom", "company.ogrn"],
			],
		);
		assert.ok(errors.every((i) => i.message.length > 0));
	});

	test("выбранная сохранённая компания — реквизиты не проверяются", () => {
		assert.deepEqual(
			issues(
				company({ existingCompanyId: "5", companyName: "", taxNumber: "" }),
			),
			[],
		);
		assert.deepEqual(
			issues({ ...base, company: { isCompany: false, saveCompany: false } }),
			[],
		);
	});
});

describe("collectFieldErrors", () => {
	test("первое сообщение по пути выигрывает; ошибки без пути пропускаются", () => {
		assert.deepEqual(
			collectFieldErrors([
				{ path: [], message: "форма целиком" },
				{ path: ["delivery", "address", "city"], message: "первое" },
				{ path: ["delivery", "address", "city"], message: "второе" },
				{ path: ["items", 0], message: "строка" },
			]),
			{ "delivery.address.city": "первое", "items.0": "строка" },
		);
	});
});
