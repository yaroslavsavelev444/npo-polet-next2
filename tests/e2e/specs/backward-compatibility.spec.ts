import path from "node:path";
import { expect, test } from "@playwright/test";
import {
	FIELD,
	openCheckout,
	readOrder,
	resetCart,
	submitButton,
} from "../helpers";

/**
 * Совместимость со старыми заказами.
 *
 * В базе одновременно живут три поколения адреса:
 *  1. перенесённые заказы — весь адрес одной строкой в `street`;
 *  2. заказы после разбиения на поля — city/street/house/apartment;
 *  3. текущие — плюс `fullAddress` и идентификаторы справочника.
 * Стенд содержит по заказу каждого из первых двух поколений (см.
 * scripts/seed-checkout-e2e.ts); третье создаётся прямо в тесте.
 *
 * Проверяются обе стороны: витрина покупателя и админка.
 */

const LEGACY_SINGLE_LINE = "ORD-2019-000001";
const LEGACY_SPLIT_FIELDS = "ORD-2020-000002";

// Убирает заказы, созданные предыдущими тестами. Без этого список покупателя
// разрастается, исторические заказы уезжают за пределы первой страницы
// пагинации, и тесты начинают падать по причине, не связанной с кодом.
test.beforeEach(() => {
	resetCart();
});

test.describe("витрина покупателя", () => {
	test("исторические заказы отображаются в списке", async ({ page }) => {
		await page.goto("/orders");

		await expect(page.getByText(`Заказ №${LEGACY_SINGLE_LINE}`)).toBeVisible();
		await expect(page.getByText(`Заказ №${LEGACY_SPLIT_FIELDS}`)).toBeVisible();
	});

	test("адрес одной строкой выводится как есть, без выдуманных префиксов", async ({
		page,
	}) => {
		await page.goto("/orders");
		await page.getByText(`Заказ №${LEGACY_SINGLE_LINE}`).click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toBeVisible();
		// Ровно то, что лежит в street: дописывать «д.»/«кв.» здесь не к чему.
		await expect(dialog).toContainText("г. Тула, ул. Старая, д. 7, кв. 3");
		// Пустых сегментов «, , ,» из незаполненных полей быть не должно.
		await expect(dialog).not.toContainText(", , ");
	});

	test("разбитый адрес без новых полей собирается корректно", async ({
		page,
	}) => {
		await page.goto("/orders");
		await page.getByText(`Заказ №${LEGACY_SPLIT_FIELDS}`).click();

		const dialog = page.getByRole("dialog");
		await expect(dialog).toContainText("248000");
		await expect(dialog).toContainText("Калуга");
		await expect(dialog).toContainText("ул. Новая");
		await expect(dialog).toContainText("д. 12");
		await expect(dialog).toContainText("кв./офис 45");
	});

	test("отсутствие новых полей не роняет страницу", async ({ page }) => {
		// Ошибка вида «cannot read property of undefined» на историческом
		// заказе — самый вероятный способ сломать витрину этой задачей.
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));

		await page.goto("/orders");
		await page.getByText(`Заказ №${LEGACY_SINGLE_LINE}`).click();
		await expect(page.getByRole("dialog")).toBeVisible();

		expect(errors).toEqual([]);
	});

	test("старые и новые заказы уживаются в одном списке", async ({ page }) => {
		resetCart();
		await openCheckout(page);
		await page.locator(FIELD.recipientFullName).fill("Иванов Иван Иванович");
		await page.locator(FIELD.recipientPhone).fill("+79991234567");
		await page.locator(FIELD.recipientEmail).fill("ivanov@example.com");
		await page.getByRole("radio", { name: /E2E Пункт самовывоза/ }).click();
		await submitButton(page).click();
		await expect(page).toHaveURL(/\/orders\/ORD-/, { timeout: 30_000 });

		await page.goto("/orders");
		await expect(page.getByText(`Заказ №${LEGACY_SINGLE_LINE}`)).toBeVisible();
		await expect(page.getByText(/Заказ №ORD-2026-/).first()).toBeVisible();
	});
});

test.describe("админка", () => {
	// Собственная сессия: админ — аккаунт другой коллекции, и подставлять
	// вместо него сессию покупателя нельзя.
	test.use({
		storageState: path.join(__dirname, "../.auth/admin-state.json"),
	});

	// Админка Payload — отдельное большое приложение, и в dev-режиме её первая
	// страница компилируется дольше стандартного таймаута. К поведению кода
	// это отношения не имеет, поэтому запас даётся именно здесь.
	test.setTimeout(180_000);

	test("исторический заказ открывается на редактирование без ошибок", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));

		const order = readOrder(LEGACY_SINGLE_LINE);
		await page.goto(`/admin/collections/orders/${order.id}`);

		await expect(page.locator("#field-orderNumber")).toHaveValue(
			LEGACY_SINGLE_LINE,
			{ timeout: 30_000 },
		);
		// Незаполненные новые поля отображаются пустыми, а не ломают форму.
		await expect(page.getByLabel("Адрес одной строкой")).toHaveValue("");
		await expect(page.getByLabel("Улица")).toHaveValue(
			"г. Тула, ул. Старая, д. 7, кв. 3",
		);

		expect(errors).toEqual([]);
	});

	test("частично заполненный адрес показывает только заполненные поля", async ({
		page,
	}) => {
		const order = readOrder(LEGACY_SPLIT_FIELDS);
		await page.goto(`/admin/collections/orders/${order.id}`);

		await expect(page.getByLabel("Город")).toHaveValue("Калуга", {
			timeout: 30_000,
		});
		await expect(page.getByLabel("Дом")).toHaveValue("12");
		await expect(page.getByLabel("Квартира / офис")).toHaveValue("45");
		// Полей, которых у этого поколения не было, — пустые, но не сломанные.
		await expect(page.getByLabel("Подъезд")).toHaveValue("");
		await expect(page.getByLabel("Корпус / строение")).toHaveValue("");
	});

	test("REST API отдаёт исторические заказы без падения", async ({
		request,
	}) => {
		const order = readOrder(LEGACY_SINGLE_LINE);
		// Payload отбрасывает JWT из cookie у запроса без Origin и без
		// Sec-Fetch-Site (защита от CSRF, см. extractJWT). Браузер эти
		// заголовки шлёт сам, а API-клиент Playwright — нет.
		const response = await request.get(`/api/orders/${order.id}?depth=0`, {
			headers: { Origin: "http://localhost:3000" },
		});

		expect(response.status()).toBe(200);
		const body = await response.json();
		expect(body.orderNumber).toBe(LEGACY_SINGLE_LINE);
		// Новые поля отсутствуют или null — и то и другое допустимо.
		expect(body.delivery.address.fullAddress ?? null).toBeNull();
		expect(body.delivery.address.street).toBe(
			"г. Тула, ул. Старая, д. 7, кв. 3",
		);
	});

	test("список заказов открывается со смешанными поколениями", async ({
		page,
	}) => {
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));

		// Сортировка по номеру: исторические заказы 2019/2020 гарантированно
		// попадают на первую страницу независимо от того, сколько заказов
		// создали предыдущие тесты.
		await page.goto("/admin/collections/orders?sort=orderNumber&limit=100");

		await expect(page.getByText(LEGACY_SINGLE_LINE).first()).toBeVisible({
			timeout: 30_000,
		});
		expect(errors).toEqual([]);
	});
});
