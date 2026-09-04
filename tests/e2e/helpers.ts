import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

// Playwright исполняет конфиг и тесты как CommonJS, поэтому здесь
// используется __dirname, а не import.meta.url.
const DIRNAME = __dirname;
const ROOT = path.resolve(DIRNAME, "../..");

/**
 * id полей формы оформления заказа.
 *
 * Продублированы здесь строками намеренно: тест обязан ломаться, если id
 * поменяется в коде, — именно на них завязаны и переходы из сводки ошибок,
 * и `aria-describedby`. Импорт реестра сделал бы тест слепым к такому
 * изменению (он бы просто поехал вместе с кодом).
 */
export const FIELD = {
	customerPhone: "#checkout-customer-phone",
	contactPreference: "#checkout-contact-preference",
	recipientFullName: "#checkout-recipient-full-name",
	recipientPhone: "#checkout-recipient-phone",
	recipientEmail: "#checkout-recipient-email",
	transportCompany: "#checkout-transport-company",
	pickupPoint: "#checkout-pickup-point",
	addressQuery: "#checkout-address-query",
	addressCity: "#checkout-address-city",
	addressStreet: "#checkout-address-street",
	addressHouse: "#checkout-address-house",
	addressPostalCode: "#checkout-address-postal-code",
	companyName: "#checkout-company-name",
	companyLegalAddress: "#checkout-company-legal-address",
	companyTaxNumber: "#checkout-company-tax-number",
	payment: "#checkout-payment",
} as const;

/** Возвращает корзину и предпочтения тестового покупателя в исходный вид. */
export function resetCart(): void {
	execFileSync(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(ROOT, "scripts/reset-e2e-cart.ts"),
		],
		{ cwd: ROOT, stdio: "pipe" },
	);
}

/**
 * Читает заказ из базы по номеру.
 *
 * Проверять оформление только по экрану недостаточно: расхождение между
 * показанным и сохранённым адресом обнаружилось бы уже на складе.
 * Payload-клиент нельзя поднять внутри браузерного контекста, поэтому чтение
 * идёт отдельным процессом.
 */
// biome-ignore lint/suspicious/noExplicitAny: форма документа заказа проверяется в самих тестах
export function readOrder(orderNumber: string): any {
	const raw = execFileSync(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(ROOT, "scripts/dump-order.ts"),
			orderNumber,
		],
		{ cwd: ROOT, encoding: "utf8" },
	);
	// В stdout попадают предупреждения Node и Payload — берём последнюю
	// строку, она и есть JSON документа.
	const lines = raw.trim().split("\n");
	return JSON.parse(lines[lines.length - 1]);
}

export async function openCheckout(page: Page): Promise<void> {
	await page.goto("/checkout");
	await expect(
		page.getByRole("heading", { name: "Оформление заказа" }),
	).toBeVisible();
}

export function errorSummary(page: Page): Locator {
	return page
		.getByRole("alert")
		.filter({ hasText: /Полей с ошибками|требует внимания/ });
}

export function submitButton(page: Page): Locator {
	return page.getByRole("button", { name: "Подтвердить заказ" });
}

/**
 * Переключает блок организации на ввод новой компании.
 *
 * У покупателя с сохранёнными организациями блок открывается на их выборе, и
 * полей новой компании на странице просто нет. Тесты, которым нужны именно
 * поля, обязаны переключиться — иначе они падают не на проверяемом поведении,
 * а на разной истории пользователя.
 */
export async function switchToNewCompany(page: Page): Promise<void> {
	const toggle = page.getByRole("button", { name: "Новая компания" });
	if (await toggle.isVisible()) await toggle.click();
}

export function deliveryMethodButton(page: Page, label: string): Locator {
	return page.getByRole("button", { name: new RegExp(label) });
}

/**
 * Заполняет корректные контактные данные в самом частом сценарии: заказ
 * оформляет и получает один и тот же человек, отдельного номера получателя
 * нет. Телефон получателя добавляется отдельно — см. fillSeparateRecipientPhone.
 */
export async function fillRecipient(page: Page): Promise<void> {
	await page.locator(FIELD.customerPhone).fill("+79991234567");
	await page.locator(FIELD.recipientFullName).fill("Иванов Иван Иванович");
	await page.locator(FIELD.recipientEmail).fill("ivanov@example.com");
}

/**
 * Включает отдельного получателя и вводит его номер. Пока переключатель
 * выключен, поля телефона получателя нет в порядке табуляции (inert), поэтому
 * заполнить его без переключателя нельзя — это и проверяется в тестах.
 */
export async function fillSeparateRecipientPhone(
	page: Page,
	phone = "+79997654321",
): Promise<void> {
	await page
		.getByRole("checkbox", { name: "Заказ получит другой человек" })
		.check();
	await page.locator(FIELD.recipientPhone).fill(phone);
}

/** Выбирает, чей номер менеджер использует для связи по заказу. */
export async function chooseCallTarget(
	page: Page,
	target: "Мне" | "Получателю",
): Promise<void> {
	await page
		.locator(FIELD.contactPreference)
		.getByRole("radio", { name: target })
		.click();
}

/**
 * Вводит запрос в поле адреса и дожидается списка подсказок.
 * Ждём именно ответ роута, а не таймаут: debounce и сеть дают разброс, а
 * фиксированная пауза превратила бы тест в нестабильный.
 */
export async function typeAddress(page: Page, query: string): Promise<void> {
	const response = page.waitForResponse(
		(res) => res.url().includes("/api/address/suggest") && res.status() === 200,
		{ timeout: 20_000 },
	);
	await page.locator(FIELD.addressQuery).click();
	await page.locator(FIELD.addressQuery).fill(query);
	await response;
}

export function suggestionList(page: Page): Locator {
	return page.getByRole("listbox", { name: "Варианты адреса" });
}

export function suggestionOption(page: Page, text: string | RegExp): Locator {
	return suggestionList(page).getByRole("option").filter({ hasText: text });
}
