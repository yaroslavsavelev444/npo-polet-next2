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
 * Отказы, повторы и всё, что происходит не по счастливому сценарию.
 *
 * Оформление заказа — операция с побочным эффектом, который нельзя отменить
 * незаметно: лишний заказ уходит в работу склада. Поэтому здесь проверяется
 * не «показалось ли сообщение», а что именно произошло с данными.
 */

test.beforeEach(() => {
	resetCart();
});

async function fillValidSelfPickup(page: import("@playwright/test").Page) {
	await fillRecipient(page);
	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();
}

test("двойное нажатие не создаёт второй заказ", async ({ page }) => {
	await openCheckout(page);
	await fillValidSelfPickup(page);

	// Два клика в одном тике — ровно то, что делает пользователь, когда
	// страница «подтормаживает». Через API Playwright так не получится:
	// второй клик ждал бы актуальности элемента и пришёл уже после навигации,
	// то есть проверял бы не гонку, а последовательность.
	await submitButton(page).evaluate((element: HTMLElement) => {
		element.click();
		element.click();
	});
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	await page.goto("/orders");
	// Помимо двух исторических заказов стенда должен появиться ровно один новый.
	await expect(page.getByText(/Заказ №ORD-2026-/)).toHaveCount(1);
});

test("сетевой сбой при отправке не теряет заполненную форму", async ({
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

	// Обрываем именно отправку заказа (Server Action), а не любой запрос.
	await page.route("**/checkout", async (route) => {
		if (route.request().method() === "POST") {
			await route.abort("failed");
			return;
		}
		await route.continue();
	});

	await submitButton(page).click();

	await expect(
		page.getByRole("alert").filter({ hasText: /соединение/ }),
	).toBeVisible();
	// Форма осталась на месте со всеми данными — переоформлять заново не нужно.
	await expect(page.locator(FIELD.addressQuery)).toHaveValue(
		"г Москва, ул Ленина, д 10",
	);
	await expect(page.getByLabel("Квартира / офис")).toHaveValue("42");
	await expect(page.locator(FIELD.recipientFullName)).toHaveValue(
		"Иванов Иван Иванович",
	);

	// После восстановления связи повторная отправка проходит.
	await page.unroute("**/checkout");
	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });
});

test("серверная ошибка поля показывается в сводке и гаснет после правки", async ({
	page,
}) => {
	// Единственная проверка, которую клиент воспроизвести не может:
	// принадлежность организации известна только серверу.
	await openCheckout(page);
	await fillValidSelfPickup(page);

	await page.getByLabel("Заказ от юридического лица").check();
	await page.getByRole("button", { name: /E2E Организация/ }).click();
	await expect(errorSummary(page)).toBeHidden();

	// Организацию удалили, пока пользователь заполнял форму.
	dropCompany();
	await submitButton(page).click();

	const summary = errorSummary(page);
	await expect(summary).toContainText("Организация");
	await expect(summary).toContainText("не найдена");
	// Заказ при этом не создан.
	await expect(page).toHaveURL(/\/checkout/);

	// Пользователь переключается на ручной ввод реквизитов — серверная ошибка
	// обязана погаснуть сама, без повторной отправки: значение поля изменилось.
	await switchToNewCompany(page);
	// Сообщение исчезает целиком: сводка либо пуста, либо уже скрыта.
	await expect(page.getByText("не найдена")).toHaveCount(0);

	await page.locator(FIELD.companyName).fill("ООО Ромашка");
	await page
		.locator(FIELD.companyLegalAddress)
		.fill("г Москва, ул Ленина, д 1");
	await page.locator(FIELD.companyTaxNumber).fill("7707083893");

	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	const order = readOrder(page.url().split("/").pop() as string);
	expect(order.companyInfo.name).toBe("ООО Ромашка");
});

test("опустевшая корзина обнаруживается при отправке", async ({ page }) => {
	await openCheckout(page);
	await fillValidSelfPickup(page);

	// Корзину опустошили в другой вкладке уже после открытия оформления.
	emptyCart();

	await submitButton(page).click();

	await expect(
		page.getByRole("alert").filter({ hasText: /Корзина пуста/ }),
	).toBeVisible({ timeout: 30_000 });
	await expect(page).toHaveURL(/\/checkout/);
});

test("перезагрузка посреди заполнения не оставляет полузаказ", async ({
	page,
}) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();
	await fillRecipient(page);
	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 10").click();

	await page.reload();

	// Черновик формы намеренно не сохраняется: страница открывается чистой.
	await expect(page.locator(FIELD.recipientFullName)).toHaveValue("");
	// И никакого заказа при этом не создалось.
	await page.goto("/orders");
	await expect(page.getByText(/Заказ №ORD-2026-/)).toHaveCount(0);
});

test("повторный заход на оформление после успешного заказа уводит в корзину", async ({
	page,
}) => {
	await openCheckout(page);
	await fillValidSelfPickup(page);
	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });
	const orderNumber = page.url().split("/").pop() as string;

	// Корзина очищена оформлением, поэтому страница оформления открываться
	// не должна — иначе пользователь оформил бы пустой заказ.
	await page.goto("/checkout");
	await expect(page).toHaveURL(/\/cart/, { timeout: 30_000 });

	await page.goto("/orders");
	await expect(page.getByText(`Заказ №${orderNumber}`)).toHaveCount(1);
});

test("истёкшая сессия при запросе подсказок не ломает форму", async ({
	page,
}) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();

	await page.route("**/api/address/suggest", (route) =>
		route.fulfill({
			status: 401,
			contentType: "application/json",
			body: JSON.stringify({ error: "Требуется авторизация" }),
		}),
	);

	await page.locator(FIELD.addressQuery).click();
	await page.locator(FIELD.addressQuery).fill("москва ленина");

	await expect(page.getByText(/Не удалось загрузить подсказки/)).toBeVisible({
		timeout: 15_000,
	});
	// Ручной ввод остаётся доступен — заказ можно оформить и без подсказок.
	await page
		.getByRole("button", { name: "Ввести адрес вручную" })
		.first()
		.click();
	await expect(page.locator(FIELD.addressCity)).toBeVisible();
});

test("несколько ошибок исправляются по одной, сводка не отстаёт", async ({
	page,
}) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();
	await submitButton(page).click();

	// Email подставлен из аккаунта и уже корректен, поэтому проблем четыре:
	// перевозчик, адрес (одной записью), ФИО и телефон.
	const summary = errorSummary(page);
	await expect(summary.getByRole("listitem")).toHaveCount(4);

	await page
		.locator(FIELD.transportCompany)
		.selectOption({ label: "E2E Перевозчик" });
	await expect(summary.getByRole("listitem")).toHaveCount(3);

	await typeAddress(page, "москва ленина");
	await suggestionOption(page, "д 10").click();
	await expect(summary.getByRole("listitem")).toHaveCount(2);

	await fillRecipient(page);
	await expect(summary).toBeHidden();

	// Форма стала валидной — повторная отправка проходит без препятствий.
	await submitButton(page).click();
	await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

	const order = readOrder(page.url().split("/").pop() as string);
	expect(order.delivery.address.house).toBe("10");
});

/** Меняет состояние стенда посреди теста — так же, как это сделал бы
 * параллельный сеанс пользователя или администратор. */
function runResetScript(flag: string): void {
	const { execFileSync } = require("node:child_process");
	const path = require("node:path");
	execFileSync(
		process.execPath,
		[
			"--experimental-strip-types",
			path.resolve(__dirname, "../../../scripts/reset-e2e-cart.ts"),
			flag,
		],
		{ cwd: path.resolve(__dirname, "../../.."), stdio: "pipe" },
	);
}

/** Опустошает корзину тестового покупателя. */
function emptyCart(): void {
	runResetScript("--empty");
}

/** Удаляет сохранённую организацию покупателя. */
function dropCompany(): void {
	runResetScript("--drop-company");
}
