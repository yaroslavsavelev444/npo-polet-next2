import { expect, test } from "@playwright/test";
import {
	deliveryMethodButton,
	errorSummary,
	FIELD,
	fillRecipient,
	openCheckout,
	resetCart,
	submitButton,
	suggestionOption,
	switchToNewCompany,
	typeAddress,
} from "../helpers";

/**
 * Обратная связь формы оформления заказа.
 *
 * Главная проверяемая мысль: пользователь в любой момент понимает, что
 * именно мешает оформить заказ, и видит, как эта картина меняется по мере
 * исправлений. Раньше кнопка просто была заблокирована, а причина не
 * показывалась нигде.
 */

test.beforeEach(() => {
	resetCart();
});

test("кнопка подтверждения активна даже при незаполненной форме", async ({
	page,
}) => {
	// Заблокированная кнопка не объясняет, чего не хватает: пользователь
	// остаётся без обратной связи вообще. Нажатие обязано быть возможным —
	// именно оно и показывает список проблем.
	await openCheckout(page);

	await expect(submitButton(page)).toBeEnabled();
	await expect(errorSummary(page)).toBeHidden();
});

test("пустая форма при отправке показывает сводку со всеми проблемами", async ({
	page,
}) => {
	await openCheckout(page);
	await submitButton(page).click();

	const summary = errorSummary(page);
	await expect(summary).toBeVisible();
	await expect(summary).toContainText("ФИО получателя");
	// Телефон заказчика назван «Ваш телефон» — в сводке он не должен путаться
	// с телефоном получателя, который необязателен и ошибки не даёт.
	await expect(summary).toContainText("Ваш телефон");
	await expect(summary).not.toContainText("Телефон получателя");
	await expect(summary).toContainText("Пункт самовывоза");

	// Заказ не создан: остались на странице оформления.
	await expect(page).toHaveURL(/\/checkout$/);
});

test("ошибка показывается и у самого поля, а не только в сводке", async ({
	page,
}) => {
	await openCheckout(page);
	await submitButton(page).click();

	const fullName = page.locator(FIELD.recipientFullName);
	await expect(fullName).toHaveAttribute("aria-invalid", "true");

	// Сообщение связано с полем через aria-describedby — иначе скринридер
	// прочитает поле как обычное, без объяснения ошибки.
	const describedBy = await fullName.getAttribute("aria-describedby");
	expect(describedBy).toBeTruthy();
	await expect(page.locator(`#${describedBy}`)).toContainText(/ФИО|фамилию/i);
});

test("переход из сводки ставит фокус в проблемное поле", async ({ page }) => {
	await openCheckout(page);
	await submitButton(page).click();

	await errorSummary(page)
		.getByRole("button", { name: /ФИО получателя/ })
		.click();

	await expect(page.locator(FIELD.recipientFullName)).toBeFocused();
});

test("исправление ошибок постепенно опустошает сводку", async ({ page }) => {
	await openCheckout(page);
	await submitButton(page).click();

	const summary = errorSummary(page);
	await expect(summary).toContainText("ФИО получателя");

	await page.locator(FIELD.recipientFullName).fill("Иванов Иван Иванович");
	// Запись исчезает немедленно, без повторной отправки: ошибки
	// пересчитываются из текущих значений, а не хранятся.
	await expect(summary).not.toContainText("ФИО получателя");
	await expect(summary).toContainText("Ваш телефон");

	await page.locator(FIELD.customerPhone).fill("+79991234567");
	await expect(summary).not.toContainText("Ваш телефон");

	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();

	// Последняя ошибка ушла — блок исчезает целиком, а не остаётся пустым.
	await expect(summary).toBeHidden();
});

test("ошибка не появляется до того, как пользователь дошёл до поля", async ({
	page,
}) => {
	await openCheckout(page);

	// Ругаться на пустое поле, которого пользователь ещё не касался, —
	// худший вид «помощи»: форма выглядит сломанной с первой секунды.
	await expect(page.locator(FIELD.recipientFullName)).not.toHaveAttribute(
		"aria-invalid",
		"true",
	);

	await page.locator(FIELD.recipientFullName).click();
	await page.locator(FIELD.recipientEmail).click();

	await expect(page.locator(FIELD.recipientFullName)).toHaveAttribute(
		"aria-invalid",
		"true",
	);
});

test("единственная ошибка уводит сразу в поле, без списка из одного пункта", async ({
	page,
}) => {
	await openCheckout(page);
	await fillRecipient(page);
	// Осталась ровно одна проблема — не выбран пункт самовывоза.
	await submitButton(page).click();

	// Группа выбора сама по себе не фокусируема, поэтому фокус обязан уйти
	// на первый вариант внутри неё: иначе пользователь оказывается «рядом с»
	// проблемой, но не может решить её с клавиатуры.
	await expect(
		page.locator(FIELD.pickupPoint).getByRole("radio").first(),
	).toBeFocused();
});

test("смена способа доставки меняет набор требований", async ({ page }) => {
	await openCheckout(page);
	await fillRecipient(page);
	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();

	await deliveryMethodButton(page, "Курьер до двери").click();
	await submitButton(page).click();

	const summary = errorSummary(page);
	// Пункт самовывоза больше не требуется, зато появились адрес и перевозчик.
	await expect(summary).not.toContainText("Пункт самовывоза");
	await expect(summary).toContainText("Транспортная компания");
	await expect(summary).toContainText("Адрес");
});

test("в режиме подсказок адрес — одна запись в сводке, а не четыре", async ({
	page,
}) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();
	await submitButton(page).click();

	const addressEntries = errorSummary(page)
		.getByRole("listitem")
		.filter({ hasText: "Адрес" });

	await expect(addressEntries).toHaveCount(1);
	await expect(addressEntries.first()).toContainText(/не хватает/);
});

test("ручной режим показывает ошибку у каждого поля адреса отдельно", async ({
	page,
}) => {
	await openCheckout(page);
	await deliveryMethodButton(page, "Курьер до двери").click();
	await page.getByRole("button", { name: "Ввести адрес вручную" }).click();
	await submitButton(page).click();

	const summary = errorSummary(page);
	await expect(summary.getByRole("button", { name: /^Город/ })).toBeVisible();
	await expect(summary.getByRole("button", { name: /^Улица/ })).toBeVisible();
	await expect(summary.getByRole("button", { name: /^Дом/ })).toBeVisible();
	await expect(summary.getByRole("button", { name: /^Индекс/ })).toBeVisible();

	await summary.getByRole("button", { name: /^Улица/ }).click();
	await expect(page.locator(FIELD.addressStreet)).toBeFocused();
});

test("ПВЗ не требует индекса, курьер — требует", async ({ page }) => {
	await openCheckout(page);
	await fillRecipient(page);

	// Мок отдаёт адрес без индекса — именно на нём видно разницу.
	await deliveryMethodButton(page, "Доставка в ПВЗ").click();
	await page
		.locator(FIELD.transportCompany)
		.selectOption({ label: "E2E Перевозчик" });
	await typeAddress(page, "ржев новая");
	await suggestionOption(page, "Ржев").click();

	await expect(errorSummary(page)).toBeHidden();

	await deliveryMethodButton(page, "Курьер до двери").click();
	await submitButton(page).click();

	await expect(errorSummary(page)).toContainText(/индекс/i);
});

test("несовместимый способ оплаты не предлагается при доставке", async ({
	page,
}) => {
	await openCheckout(page);

	// При самовывозе доступны все три способа.
	await expect(page.locator(FIELD.payment).getByRole("radio")).toHaveCount(3);

	await deliveryMethodButton(page, "Курьер до двери").click();

	// При доставке остаётся только оплата по счёту — выбрать несовместимый
	// способ физически невозможно, поэтому и ошибка о нём не нужна.
	await expect(page.locator(FIELD.payment).getByRole("radio")).toHaveCount(1);
	await expect(page.locator(FIELD.payment)).toContainText("Банковский перевод");
});

test("реквизиты организации проверяются только при включённом юрлице", async ({
	page,
}) => {
	await openCheckout(page);
	await fillRecipient(page);
	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();
	await expect(errorSummary(page)).toBeHidden();

	await page.getByLabel("Заказ от юридического лица").check();
	await switchToNewCompany(page);
	await submitButton(page).click();

	const summary = errorSummary(page);
	await expect(summary).toContainText("Название компании");
	await expect(summary).toContainText("Юридический адрес");
	await expect(summary).toContainText("ИНН");

	await page.getByLabel("Заказ от юридического лица").uncheck();
	await expect(summary).toBeHidden();
});

test("некорректный ИНН отклоняется по контрольной сумме", async ({ page }) => {
	await openCheckout(page);
	await fillRecipient(page);
	await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();
	await page.getByLabel("Заказ от юридического лица").check();
	await switchToNewCompany(page);

	await page.locator(FIELD.companyName).fill("ООО Ромашка");
	await page
		.locator(FIELD.companyLegalAddress)
		.fill("г Москва, ул Ленина, д 1");
	await page.locator(FIELD.companyTaxNumber).fill("1234567890");
	await submitButton(page).click();

	await expect(errorSummary(page)).toContainText("ИНН");
});
