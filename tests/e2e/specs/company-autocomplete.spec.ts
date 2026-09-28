import { expect, type Page, test } from "@playwright/test";
import {
	companyList,
	companyOption,
	errorSummary,
	FIELD,
	fillRecipient,
	openCheckout,
	readOrder,
	resetCart,
	searchCompany,
	submitButton,
	switchToNewCompany,
} from "../helpers";

/**
 * Поиск организации по ИНН или названию в блоке «Плательщик».
 *
 * Запросы идут через настоящий роут /api/company/suggest до локального мока
 * апстрима (tests/e2e/mock-dadata.mjs, путь /party). Главное, что здесь
 * проверяется: подсказка ЗАПОЛНЯЕТ поля, но не отнимает их у покупателя —
 * реквизиты из ЕГРЮЛ можно исправить, и в заказ уходит исправленное.
 */

async function openCompanyForm(page: Page): Promise<void> {
	await openCheckout(page);
	await page.getByLabel("Заказ от юридического лица").check();
	await switchToNewCompany(page);
}

test.beforeEach(async ({ page }) => {
	resetCart();
	await openCompanyForm(page);
});

test("поиск по ИНН заполняет все реквизиты", async ({ page }) => {
	await searchCompany(page, "7707083893");

	// Головная организация и филиал: ИНН общий, различаются КПП и городом.
	await expect(companyOption(page, "КПП 773601001")).toBeVisible();
	await expect(companyOption(page, "КПП 784243001")).toContainText("Филиал");

	await companyOption(page, "КПП 773601001").click();
	await expect(companyList(page)).toBeHidden();

	await expect(page.locator(FIELD.companyName)).toHaveValue(
		"ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «РОМАШКА»",
	);
	await expect(page.locator(FIELD.companyLegalAddress)).toHaveValue(
		"117312, г Москва, ул Вавилова, д 19",
	);
	await expect(page.locator(FIELD.companyTaxNumber)).toHaveValue("7707083893");
	await expect(page.locator(FIELD.companyKpp)).toHaveValue("773601001");
	await expect(page.locator(FIELD.companyOgrn)).toHaveValue("1027700132195");
	await expect(page.getByLabel("Контактное лицо")).toHaveValue(
		"Петров Пётр Петрович",
	);
	await expect(
		page.getByText("Реквизиты заполнены по данным ЕГРЮЛ"),
	).toBeVisible();
});

test("поиск по названию и выбор филиала", async ({ page }) => {
	await searchCompany(page, "ромашка");
	await companyOption(page, "Санкт-Петербург").click();

	await expect(page.locator(FIELD.companyKpp)).toHaveValue("784243001");
	await expect(page.locator(FIELD.companyLegalAddress)).toHaveValue(
		/Санкт-Петербург/,
	);
});

test("подставленные реквизиты можно исправить, и в заказ уходит исправленное", async ({
	page,
}) => {
	await fillRecipient(page);
	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();

	await searchCompany(page, "7707083893");
	await companyOption(page, "КПП 773601001").click();

	// Выписка отстала: адрес и КПП у организации уже другие.
	await page
		.locator(FIELD.companyLegalAddress)
		.fill("117312, г Москва, ул Вавилова, д 21");
	await page.locator(FIELD.companyKpp).fill("773601002");
	await page.getByLabel("Контактное лицо").fill("Смирнова Анна");

	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	const order = readOrder(page.url().split("/").pop() as string);
	expect(order.companyInfo.name).toBe(
		"ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «РОМАШКА»",
	);
	expect(order.companyInfo.legalAddress).toBe(
		"117312, г Москва, ул Вавилова, д 21",
	);
	expect(order.companyInfo.taxNumber).toBe("7707083893");
	expect(order.companyInfo.kpp).toBe("773601002");
	expect(order.companyInfo.ogrn).toBe("1027700132195");
	expect(order.companyInfo.contactPerson).toBe("Смирнова Анна");
});

test("смена организации на ИП очищает КПП", async ({ page }) => {
	await searchCompany(page, "7707083893");
	await companyOption(page, "КПП 773601001").click();
	await expect(page.locator(FIELD.companyKpp)).toHaveValue("773601001");

	await searchCompany(page, "иванов");
	await companyOption(page, "ИП Иванов").click();

	await expect(page.locator(FIELD.companyTaxNumber)).toHaveValue(
		"500100732259",
	);
	await expect(page.locator(FIELD.companyKpp)).toHaveValue("");
	await expect(page.locator(FIELD.companyOgrn)).toHaveValue("304500116000157");
	await expect(page.getByLabel("ОГРНИП")).toBeVisible();
	await expect(page.getByLabel("Контактное лицо")).toHaveValue(
		"Иванов Иван Иванович",
	);
});

test("ликвидированная организация выбирается, но с предупреждением", async ({
	page,
}) => {
	await searchCompany(page, "закрыто");
	await expect(companyOption(page, "ЗАКРЫТО")).toContainText("Ликвидирована");
	await companyOption(page, "ЗАКРЫТО").click();

	await expect(
		page.getByText("Статус организации по данным ЕГРЮЛ: «Ликвидирована»"),
	).toBeVisible();
	await expect(page.locator(FIELD.companyTaxNumber)).toHaveValue("7736050003");
});

test("неполный ИНН не отправляется на сервер", async ({ page }) => {
	let requests = 0;
	page.on("request", (request) => {
		if (request.url().includes("/api/company/suggest")) requests += 1;
	});

	const input = page.locator(FIELD.companySearch);
	await input.click();
	await input.pressSequentially("770708389", { delay: 20 });
	await page.waitForTimeout(1000);

	expect(requests).toBe(0);
	await expect(page.getByText("Введите ИНН полностью")).toBeVisible();
});

test("пустой результат предлагает ручной ввод", async ({ page }) => {
	await searchCompany(page, "пусто");
	await expect(page.getByText("Ничего не нашлось по запросу")).toBeVisible();
	await expect(page.locator(FIELD.companyName)).toBeEditable();
});

test("сбой DaData не мешает заполнить реквизиты вручную", async ({ page }) => {
	await searchCompany(page, "сбой ромашка");
	await expect(page.getByText("Не удалось найти организацию")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Попробовать снова" }),
	).toBeVisible();

	await page.locator(FIELD.companyName).fill("ООО Ромашка");
	await expect(page.locator(FIELD.companyName)).toHaveValue("ООО Ромашка");
});

test("текст поиска без выбора подсказки не попадает в реквизиты", async ({
	page,
}) => {
	await fillRecipient(page);
	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();

	await searchCompany(page, "7707083893");
	await page.keyboard.press("Escape");
	await page.locator(FIELD.companySearch).blur();

	await expect(page.locator(FIELD.companyTaxNumber)).toHaveValue("");
	await submitButton(page).click();
	await expect(errorSummary(page)).toBeVisible();
	await expect(
		page.getByText("Укажите название компании").first(),
	).toBeVisible();
});
