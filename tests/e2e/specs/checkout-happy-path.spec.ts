import { expect, test } from "@playwright/test";
import {
	deliveryMethodButton,
	errorSummary,
	FIELD,
	fillRecipient,
	openCheckout,
	readOrder,
	resetCart,
	submitButton,
	suggestionOption,
	switchToNewCompany,
	typeAddress,
} from "../helpers";

/**
 * Успешное оформление заказа по каждому существующему способу получения.
 *
 * Проверяется не только «страница сменилась», но и что именно записано в
 * заказ: адрес, его разбор и данные для курьера. Заказ — это документ, по
 * которому потом отгружают товар, и «на экране всё было правильно» здесь
 * недостаточно.
 */

test.beforeEach(() => {
	resetCart();
});

test("самовывоз: заказ оформляется и открывается страница подтверждения", async ({
	page,
}) => {
	await openCheckout(page);
	await fillRecipient(page);
	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();

	// Наличными при самовывозе — способ оплаты по умолчанию.
	await expect(page.locator(FIELD.payment)).toContainText(
		"Наличными при самовывозе",
	);

	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });
	await expect(page.getByText(/Заказ №ORD-/)).toBeVisible();

	const orderNumber = page.url().split("/").pop() as string;
	const order = readOrder(orderNumber);

	expect(order.delivery.method).toBe("self_pickup");
	// У самовывоза адреса нет вовсе — пункт хранится связью.
	expect(order.delivery.address?.fullAddress ?? null).toBeFalsy();
	expect(order.payment.method).toBe("self_pickup_cash");
	expect(order.recipient.fullName).toBe("Иванов Иван Иванович");
	expect(order.recipient.phone).toBe("+79991234567");
});

test("курьер до двери: адрес из подсказок и данные для курьера попадают в заказ", async ({
	page,
}) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();
	await fillRecipient(page);
	await page
		.locator(FIELD.transportCompany)
		.selectOption({ label: "E2E Перевозчик" });

	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 10").click();

	await page.getByLabel("Квартира / офис").fill("42");
	await page.getByLabel("Подъезд").fill("2");
	await page.getByLabel("Этаж").fill("5");

	await expect(errorSummary(page)).toBeHidden();
	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	const order = readOrder(page.url().split("/").pop() as string);
	const address = order.delivery.address;

	expect(order.delivery.method).toBe("door_to_door");
	// Каноническая строка адреса сохранена целиком.
	expect(address.fullAddress).toBe("г Москва, ул Ленина, д 10");
	// И разобранные компоненты — тоже: по ним строятся выгрузки перевозчику.
	expect(address.city).toBe("г Москва");
	expect(address.street).toBe("ул Ленина");
	expect(address.house).toBe("10");
	expect(address.postalCode).toBe("101000");
	// Идентификаторы справочника позволяют сопоставить адрес без повторного разбора.
	expect(address.fiasId).toBe("e2e-fias-moscow-10");
	expect(address.kladrId).toBe("7700000000000000000");
	expect(address.geoLat).toBe("55.7558");
	expect(address.source).toBe("dadata");
	// Данные для курьера сохранены отдельно от адресной части.
	expect(address.apartment).toBe("42");
	expect(address.entrance).toBe("2");
	expect(address.floor).toBe("5");
});

test("доставка в ПВЗ: адрес пункта сохраняется без квартиры и подъезда", async ({
	page,
}) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Доставка в ПВЗ").click();
	await fillRecipient(page);
	await page
		.locator(FIELD.transportCompany)
		.selectOption({ label: "E2E Перевозчик" });

	// Для ПВЗ полей квартиры/подъезда/этажа на форме нет — их там не бывает.
	await expect(page.getByLabel("Квартира / офис")).toHaveCount(0);
	await expect(page.getByLabel("Подъезд")).toHaveCount(0);

	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 12").click();

	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	const order = readOrder(page.url().split("/").pop() as string);
	expect(order.delivery.method).toBe("pickup_point");
	expect(order.delivery.address.fullAddress).toBe("г Москва, ул Ленина, д 12");
	expect(order.delivery.address.apartment ?? null).toBeFalsy();
	expect(order.delivery.address.entrance ?? null).toBeFalsy();
	expect(order.payment.method).toBe("invoice");
});

test("адрес, введённый вручную, сохраняется как полноценный", async ({
	page,
}) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();
	await fillRecipient(page);
	await page
		.locator(FIELD.transportCompany)
		.selectOption({ label: "E2E Перевозчик" });

	await page.getByRole("button", { name: "Ввести адрес вручную" }).click();
	await page.locator(FIELD.addressCity).fill("Калуга");
	await page.locator(FIELD.addressStreet).fill("ул. Новая");
	await page.locator(FIELD.addressHouse).fill("12");
	await page.locator(FIELD.addressPostalCode).fill("248000");

	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	const order = readOrder(page.url().split("/").pop() as string);
	const address = order.delivery.address;

	expect(address.city).toBe("Калуга");
	expect(address.house).toBe("12");
	expect(address.postalCode).toBe("248000");
	// Читаемая строка собирается на сервере, даже если клиент её не прислал.
	expect(address.fullAddress).toContain("Калуга");
	expect(address.source).toBe("manual");
	// Идентификаторов справочника у ручного ввода быть не должно.
	expect(address.fiasId ?? null).toBeFalsy();
});

test("заказ от юридического лица сохраняет реквизиты", async ({ page }) => {
	await openCheckout(page);
	await fillRecipient(page);
	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();
	await page.getByLabel("Заказ от юридического лица").check();
	await switchToNewCompany(page);

	await page.locator(FIELD.companyName).fill("ООО Ромашка");
	await page
		.locator(FIELD.companyLegalAddress)
		.fill("г Москва, ул Ленина, д 1");
	// Валидный по контрольной сумме ИНН.
	await page.locator(FIELD.companyTaxNumber).fill("7707083893");

	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	const order = readOrder(page.url().split("/").pop() as string);
	expect(order.companyInfo.name).toBe("ООО Ромашка");
	expect(order.companyInfo.taxNumber).toBe("7707083893");
});

test("сохранённые данные подставляются в следующий заказ", async ({ page }) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();
	await fillRecipient(page);
	await page
		.locator(FIELD.transportCompany)
		.selectOption({ label: "E2E Перевозчик" });
	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 10").click();
	await page.getByLabel("Квартира / офис").fill("42");

	await page.getByLabel("Сохранить данные получателя").check();
	await page
		.getByLabel("Сохранить данные доставки для следующих заказов")
		.check();

	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	// Второе оформление: форма должна открыться уже заполненной, включая
	// разобранный адрес — иначе пользователь выбирал бы его заново.
	resetCartKeepingPreferences();
	await openCheckout(page);

	await expect(page.locator(FIELD.recipientFullName)).toHaveValue(
		"Иванов Иван Иванович",
	);
	await expect(page.locator(FIELD.addressQuery)).toHaveValue(
		"г Москва, ул Ленина, д 10",
	);
	await expect(page.getByLabel("Квартира / офис")).toHaveValue("42");
	await expect(errorSummary(page)).toBeHidden();
});

/** Возвращает товары в корзину, НЕ трогая сохранённые предпочтения. */
function resetCartKeepingPreferences(): void {
	const { execFileSync } = require("node:child_process");
	const path = require("node:path");
	execFileSync(
		process.execPath,
		[
			"--experimental-strip-types",
			path.resolve(__dirname, "../../../scripts/reset-e2e-cart.ts"),
			"--keep-preferences",
		],
		{ cwd: path.resolve(__dirname, "../../.."), stdio: "pipe" },
	);
}
