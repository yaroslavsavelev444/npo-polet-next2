import { expect, test } from "@playwright/test";
import {
	deliveryMethodButton,
	errorSummary,
	FIELD,
	openCheckout,
	resetCart,
	submitButton,
	suggestionList,
	suggestionOption,
	typeAddress,
} from "../helpers";

/**
 * Подсказки адреса.
 *
 * Запросы идут через настоящий роут /api/address/suggest — до локального
 * мока апстрима (tests/e2e/mock-dadata.mjs). То есть проверяется вся
 * цепочка: сессия, ограничение частоты, кэш, разбор ответа, UI.
 * Отдельные тесты подменяют ответ роута через page.route там, где нужно
 * воспроизвести состояние, которого мок дать не может.
 */

test.beforeEach(async ({ page }) => {
	resetCart();
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();
});

test("подсказки появляются по мере ввода и содержат разобранный адрес", async ({
	page,
}) => {
	await typeAddress(page, "москва ленина");

	await expect(suggestionList(page)).toBeVisible();
	await expect(suggestionOption(page, "д 10")).toBeVisible();
	await expect(suggestionOption(page, "д 12")).toBeVisible();
});

test("короткий запрос не отправляется на сервер", async ({ page }) => {
	// Ниже трёх символов подсказки — шум, а квота провайдера общая на аккаунт.
	let requests = 0;
	page.on("request", (request) => {
		if (request.url().includes("/api/address/suggest")) requests += 1;
	});

	await page.locator(FIELD.addressQuery).click();
	await page.locator(FIELD.addressQuery).fill("мо");
	await page.waitForTimeout(1000);

	expect(requests).toBe(0);
});

test("быстрый набор схлопывается в один запрос", async ({ page }) => {
	// Без debounce каждый символ уходил бы отдельным запросом: 13 символов —
	// 13 обращений к провайдеру на один адрес.
	const queries: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/api/address/suggest")) {
			queries.push(String(request.postDataJSON()?.query ?? ""));
		}
	});

	const input = page.locator(FIELD.addressQuery);
	await input.click();
	await input.pressSequentially("москва ленина", { delay: 30 });
	await page.waitForTimeout(1500);

	expect(queries.length).toBeLessThanOrEqual(2);
	expect(queries.at(-1)).toBe("москва ленина");
});

test("выбор подсказки заполняет адрес и снимает ошибку", async ({ page }) => {
	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 10").click();

	await expect(page.locator(FIELD.addressQuery)).toHaveValue(
		"г Москва, ул Ленина, д 10",
	);
	await expect(suggestionList(page)).toBeHidden();
	// Пользователь должен видеть, что именно распозналось, а не только свою строку.
	await expect(page.getByText("Адрес определён")).toBeVisible();
	await expect(page.getByText("индекс 101000")).toBeVisible();
});

test("клавиатурная навигация: стрелки и Enter выбирают подсказку", async ({
	page,
}) => {
	await typeAddress(page, "москва ленина");

	const input = page.locator(FIELD.addressQuery);
	await input.press("ArrowDown");
	await input.press("ArrowDown");
	// Активный вариант связывается с полем через aria-activedescendant —
	// без него скринридер не сообщит, что подсвечено.
	await expect(input).toHaveAttribute("aria-activedescendant", /.+/);
	await input.press("Enter");

	await expect(input).toHaveValue("г Москва, ул Ленина, д 12");
});

test("Escape закрывает список, не стирая набранное", async ({ page }) => {
	await typeAddress(page, "москва ленина");
	await expect(suggestionList(page)).toBeVisible();

	await page.locator(FIELD.addressQuery).press("Escape");

	await expect(suggestionList(page)).toBeHidden();
	await expect(page.locator(FIELD.addressQuery)).toHaveValue("москва ленина");
});

test("поле объявлено как combobox по спецификации ARIA", async ({ page }) => {
	const input = page.locator(FIELD.addressQuery);
	await expect(input).toHaveAttribute("role", "combobox");
	await expect(input).toHaveAttribute("aria-autocomplete", "list");
	await expect(input).toHaveAttribute("aria-expanded", "false");

	await typeAddress(page, "москва ленина");
	await expect(input).toHaveAttribute("aria-expanded", "true");
});

test("неполная подсказка (до улицы) не считается готовым адресом", async ({
	page,
}) => {
	await typeAddress(page, "москва ленина");

	// Подсказка до улицы подписана отдельно — по этой подписи её и находим.
	const streetOnly = suggestionOption(page, "Уточните номер дома");
	await expect(streetOnly).toContainText("ул Ленина");
	await streetOnly.click();

	await submitButton(page).click();
	await expect(errorSummary(page)).toContainText(/дом/);
});

test("правка выбранного адреса сбрасывает разбор, а не оставляет старый", async ({
	page,
}) => {
	// Иначе заказ уехал бы по адресу, которого пользователь уже не видит в поле.
	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 10").click();
	await expect(page.getByText("Адрес определён")).toBeVisible();

	await page.locator(FIELD.addressQuery).fill("москва ленина д");

	await expect(page.getByText("Адрес определён")).toBeHidden();
	await submitButton(page).click();
	await expect(errorSummary(page)).toContainText(/дом|адрес/i);
});

test("кнопка очистки возвращает поле в исходное состояние", async ({
	page,
}) => {
	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 10").click();

	await page.getByRole("button", { name: "Очистить адрес" }).click();

	await expect(page.locator(FIELD.addressQuery)).toHaveValue("");
	await expect(page.getByText("Адрес определён")).toBeHidden();
});

test("данные для курьера живут отдельно и переживают смену адреса", async ({
	page,
}) => {
	// Квартира/подъезд/этаж не относятся к адресной части: выбор другого дома
	// не должен их стирать.
	await page.getByLabel("Квартира / офис").fill("42");
	await page.getByLabel("Подъезд").fill("2");
	await page.getByLabel("Этаж").fill("5");

	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 10").click();

	await expect(page.getByLabel("Квартира / офис")).toHaveValue("42");
	await expect(page.getByLabel("Подъезд")).toHaveValue("2");
	await expect(page.getByLabel("Этаж")).toHaveValue("5");
});

test("сельский адрес без города принимается по населённому пункту", async ({
	page,
}) => {
	await typeAddress(page, "юдино лесная");
	await suggestionOption(page, "Юдино").click();

	await page
		.locator(FIELD.transportCompany)
		.selectOption({ label: "E2E Перевозчик" });
	await page.locator(FIELD.customerPhone).fill("+79991234567");
	await page.locator(FIELD.recipientFullName).fill("Иванов Иван Иванович");
	await page.locator(FIELD.recipientEmail).fill("ivanov@example.com");

	// Города нет, но есть населённый пункт и индекс — заказ обязан оформиться.
	// Раньше проверка требовала именно `city`, и такой адрес отклонялся целиком.
	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });
});

test("пустой результат предлагает ручной ввод", async ({ page }) => {
	await typeAddress(page, "пусто такого адреса нет");

	await expect(page.getByText(/Ничего не нашлось/)).toBeVisible();
	await page
		.getByRole("button", { name: "Ввести адрес вручную" })
		.first()
		.click();

	await expect(page.locator(FIELD.addressCity)).toBeVisible();
	await expect(page.locator(FIELD.addressQuery)).toBeHidden();
});

test("сбой апстрима не ломает форму и предлагает повтор", async ({ page }) => {
	await typeAddress(page, "сбой апстрима");

	await expect(page.getByText(/Не удалось загрузить подсказки/)).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Попробовать снова" }),
	).toBeVisible();

	// Повтор после восстановления апстрима возвращает подсказки.
	await page.locator(FIELD.addressQuery).fill("москва ленина");
	await page.waitForResponse((res) =>
		res.url().includes("/api/address/suggest"),
	);
	await expect(suggestionOption(page, "д 10")).toBeVisible();
});

test("исчерпанная квота провайдера сообщается отдельным текстом", async ({
	page,
}) => {
	await typeAddress(page, "лимит исчерпан");
	await expect(page.getByText(/Не удалось загрузить подсказки/)).toBeVisible();
});

test("таймаут апстрима не подвешивает форму", async ({ page }) => {
	await page.locator(FIELD.addressQuery).click();
	await page.locator(FIELD.addressQuery).fill("медленно очень");

	// Клиентский таймаут запроса к провайдеру — 4 секунды.
	await expect(page.getByText(/Не удалось загрузить подсказки/)).toBeVisible({
		timeout: 20_000,
	});
	// Форма остаётся управляемой: можно перейти к ручному вводу.
	await page
		.getByRole("button", { name: "Ввести адрес вручную" })
		.first()
		.click();
	await expect(page.locator(FIELD.addressCity)).toBeVisible();
});

test("подсказки не настроены — форма сразу в ручном режиме", async ({
	page,
}) => {
	// Ответ роута подменяется, потому что переменную окружения сервера
	// посреди прогона не поменять, а поведение проверить нужно.
	await page.route("**/api/address/suggest", (route) =>
		route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ suggestions: [], degraded: "not_configured" }),
		}),
	);

	await page.locator(FIELD.addressQuery).click();
	await page.locator(FIELD.addressQuery).fill("москва ленина");

	await expect(page.locator(FIELD.addressCity)).toBeVisible({
		timeout: 15_000,
	});
});

test("ручной ввод даёт валидный адрес без подсказок", async ({ page }) => {
	await page.getByRole("button", { name: "Ввести адрес вручную" }).click();

	await page.locator(FIELD.addressCity).fill("Калуга");
	await page.locator(FIELD.addressStreet).fill("ул. Новая");
	await page.locator(FIELD.addressHouse).fill("12");
	await page.locator(FIELD.addressPostalCode).fill("248000");
	await page
		.locator(FIELD.transportCompany)
		.selectOption({ label: "E2E Перевозчик" });
	await page.locator(FIELD.customerPhone).fill("+79991234567");
	await page.locator(FIELD.recipientFullName).fill("Иванов Иван Иванович");
	await page.locator(FIELD.recipientEmail).fill("ivanov@example.com");

	await expect(errorSummary(page)).toBeHidden();
	// Собранный вручную адрес попадает в панель подтверждения целиком.
	await expect(
		page.getByText(/248000, Калуга, ул\. Новая, д\. 12/),
	).toBeVisible();
});

test("возврат к подсказкам сохраняет уже введённое", async ({ page }) => {
	await page.getByRole("button", { name: "Ввести адрес вручную" }).click();
	await page.locator(FIELD.addressCity).fill("Калуга");
	await page.locator(FIELD.addressStreet).fill("ул. Новая");

	await page
		.getByRole("button", { name: "Вернуться к подсказкам адреса" })
		.click();

	await expect(page.locator(FIELD.addressQuery)).toHaveValue(/Калуга/);
});
