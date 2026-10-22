import path from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Чат поддержки целиком, как его видят люди: покупатель на витрине и
 * менеджер в консоли /admin/support, два контекста с разными сессиями.
 *
 *   pnpm test:e2e:support
 *
 * Один длинный сценарий, а не набор независимых тестов: у покупателя один
 * открытый диалог, и шаги (первое сообщение → ответ → закрытие → оценка)
 * строятся друг на друге. Сиды — scripts/seed-support-e2e.ts.
 */

const AUTH = path.join(__dirname, "../.auth");
const CUSTOMER_NAME = "Чат Покупатель";
const MANAGER_NAME = "Ольга";

const PDF = Buffer.from(
	"%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n",
);

async function contextPage(browser: Browser, state: string): Promise<Page> {
	const context = await browser.newContext({
		storageState: path.join(AUTH, state),
	});
	return context.newPage();
}

test("переписка покупателя и менеджера: сообщения, «печатает», прочтение, вложение, заметка, оценка", async ({
	browser,
}) => {
	const customer = await contextPage(browser, "support-customer.json");
	const manager = await contextPage(browser, "support-manager.json");

	// ── Покупатель открывает чат ──────────────────────────────────────────────
	await customer.goto("/");
	// Баннер cookie (новый контекст — он всегда есть) лежит поверх нижнего
	// края, а значит и поверх кнопки чата.
	await customer.getByRole("button", { name: "Только необходимые" }).click();
	// Пилотную группу шлюз и Next видят не сразу: настройки в кэше до 30 с.
	const launcher = customer.getByRole("button", { name: /^Чат с менеджером/ });
	await expect(launcher).toBeVisible({ timeout: 45_000 });
	await launcher.click();

	// Заголовок окна меняется на «Ольга, менеджер», когда диалог назначен, —
	// поэтому окно ищется по связи с заголовком, а не по его тексту.
	const widget = customer.locator(
		'[role="dialog"][aria-labelledby="support-chat-title"]',
	);
	await expect(widget).toBeVisible();
	const input = widget.getByRole("textbox", { name: "Сообщение менеджеру" });
	await input.fill("Здравствуйте! Есть ли сертификаты на сеткомёт?");

	// Без согласия первое сообщение не уходит.
	await widget.getByRole("button", { name: "Отправить" }).click();
	await expect(widget.getByRole("alert")).toContainText(/согласи/i);

	await widget.getByRole("checkbox").check();
	await widget.getByRole("button", { name: "Отправить" }).click();
	await expect(
		widget.getByText("Здравствуйте! Есть ли сертификаты на сеткомёт?"),
	).toBeVisible();
	// Тот же кэш настроек: диалог грузится через Next, а сокет шлюз пускает
	// только когда сам увидит пилотную группу — до тех пор сообщение ждёт
	// переподключения (на чистой базе CI шлюз стартует раньше сида).
	await expect(widget.getByText("отправляется…")).toHaveCount(0, {
		timeout: 45_000,
	});
	await expect(widget.getByRole("button", { name: "Повторить" })).toHaveCount(
		0,
	);

	// ── Менеджер видит диалог ─────────────────────────────────────────────────
	await manager.goto("/admin/support");
	await expect(
		manager.getByRole("heading", { name: "Чат поддержки" }),
	).toBeVisible({ timeout: 60_000 });
	await manager.getByRole("tab", { name: "Все открытые" }).click();
	const row = manager
		.getByRole("navigation", { name: "Диалоги" })
		.getByRole("button", { name: new RegExp(CUSTOMER_NAME) })
		.first();
	await expect(row).toBeVisible();
	await row.click();

	const pane = manager.getByRole("region", {
		name: `Диалог с ${CUSTOMER_NAME}`,
	});
	await expect(
		pane.getByText("Здравствуйте! Есть ли сертификаты на сеткомёт?"),
	).toBeVisible();
	const claim = pane.getByRole("button", { name: "Взять себе" });
	if (await claim.isVisible()) await claim.click();

	// ── «Печатает» в обе стороны ──────────────────────────────────────────────
	// Сигнал «печатает» обе стороны шлют не чаще раза в несколько секунд —
	// поэтому печатаем, пока сигнал не дойдёт, как это и бывает у человека.
	const reply = pane.getByRole("textbox", { name: "Текст ответа" });
	await expect(async () => {
		await reply.pressSequentially("а", { delay: 20 });
		await expect(widget.getByText(`${MANAGER_NAME} печатает…`)).toBeVisible({
			timeout: 1_500,
		});
	}).toPass({ timeout: 20_000 });

	await expect(async () => {
		await input.pressSequentially("ж", { delay: 20 });
		await expect(pane.getByText("Покупатель печатает…")).toBeVisible({
			timeout: 1_500,
		});
	}).toPass({ timeout: 20_000 });
	await input.fill("");

	// ── Ответ доходит; сообщение покупателя — прочитано ───────────────────────
	await reply.fill("Да, сертификаты есть — пришлю в этот чат.");
	await pane.getByRole("button", { name: "Отправить", exact: true }).click();
	await expect(
		widget.getByText("Да, сертификаты есть — пришлю в этот чат."),
	).toBeVisible();
	await expect(
		customer.getByRole("heading", { name: `${MANAGER_NAME}, менеджер` }),
	).toBeVisible();
	await expect(widget.getByText(/прочитано/).first()).toBeVisible();

	// ── Заметка до покупателя не доходит ──────────────────────────────────────
	await pane.getByRole("checkbox", { name: "Заметка" }).check();
	await pane
		.getByRole("textbox", { name: "Текст заметки" })
		.fill("Внутреннее: клиент из тендера");
	await pane.getByRole("button", { name: "Сохранить заметку" }).click();
	await expect(pane.getByText("Внутреннее: клиент из тендера")).toBeVisible();
	await pane.getByRole("checkbox", { name: "Заметка" }).uncheck();

	// ── Вложение от покупателя ────────────────────────────────────────────────
	await widget.locator('input[type="file"]').setInputFiles({
		name: "реквизиты.pdf",
		mimeType: "application/pdf",
		buffer: PDF,
	});
	await expect(
		widget.getByRole("button", { name: "Убрать реквизиты.pdf" }),
	).toBeVisible();
	await input.fill("Реквизиты во вложении");
	await widget.getByRole("button", { name: "Отправить" }).click();
	await expect(pane.getByText("Реквизиты во вложении")).toBeVisible();
	await expect(pane.getByText(/реквизиты\.pdf/)).toBeVisible();

	// Заметка так и не появилась у покупателя — проверяем после того, как
	// дошло более позднее сообщение, а не «сразу».
	await expect(widget.getByText("Внутреннее: клиент из тендера")).toHaveCount(
		0,
	);

	// ── Закрытие и оценка ─────────────────────────────────────────────────────
	await pane.getByRole("button", { name: "Закрыть диалог" }).click();
	await expect(pane.getByRole("button", { name: "Переоткрыть" })).toBeVisible();
	await expect(
		widget.getByText("Оцените, пожалуйста, помощь менеджера"),
	).toBeVisible();
	await widget.getByRole("radio", { name: "5 из 5" }).click();
	await widget
		.getByRole("textbox", { name: "Комментарий к оценке" })
		.fill("Быстро ответили");
	await widget.getByRole("button", { name: "Отправить оценку" }).click();
	await expect(widget.getByText(/Спасибо за оценку/)).toBeVisible();

	await customer.context().close();
	await manager.context().close();
});

test("WebSocket заблокирован прокси — чат работает через long-polling", async ({
	browser,
}) => {
	const customer = await contextPage(browser, "support-customer.json");
	// Корпоративный прокси: соединение WebSocket не устанавливается — браузер
	// сообщает error и close, open не бывает. Подмена конструктора, а не
	// routeWebSocket (тот сначала «открывает» сокет странице) и не блокировка
	// через CDP (на WebSocket она не действует).
	await customer.addInitScript(() => {
		const Native = window.WebSocket;
		// Только шлюз чата: HMR dev-сервера тоже ходит по WebSocket.
		const Blocked = function (
			this: unknown,
			url: string | URL,
			protocols?: string | string[],
		) {
			if (!String(url).includes("/realtime/"))
				return new Native(url, protocols);
			const socket = new EventTarget() as WebSocket & {
				readyState: number;
			};
			Object.assign(socket, {
				url: String(url),
				readyState: 0,
				binaryType: "blob",
				send() {},
				close() {},
			});
			setTimeout(() => {
				socket.readyState = 3;
				const error = new Event("error");
				socket.onerror?.(error);
				socket.dispatchEvent(error);
				const close = new CloseEvent("close", { code: 1006 });
				socket.onclose?.(close);
				socket.dispatchEvent(close);
			}, 50);
			return socket;
		} as unknown as typeof WebSocket;
		Object.assign(Blocked, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
		window.WebSocket = Blocked;
	});
	const polling = customer.waitForRequest(
		(request) =>
			request.url().includes("/realtime/socket.io/") &&
			request.url().includes("transport=polling") &&
			request.method() === "POST",
	);

	await customer.goto("/?chat=open");
	await customer.getByRole("button", { name: "Только необходимые" }).click();
	const widget = customer.locator(
		'[role="dialog"][aria-labelledby="support-chat-title"]',
	);
	await expect(widget).toBeVisible({ timeout: 45_000 });

	const consent = widget.getByRole("checkbox");
	if (await consent.isVisible()) await consent.check();
	await widget
		.getByRole("textbox", { name: "Сообщение менеджеру" })
		.fill("Пишу из-за прокси");
	await widget.getByRole("button", { name: "Отправить" }).click();
	// Текст сообщения — в <span> внутри пузыря (автоссылки), поэтому по тексту
	// находится и пузырь, и span: берём первый, а отсутствие дубля проверяем
	// ниже по самим пузырям.
	await expect(widget.getByText("Пишу из-за прокси").first()).toBeVisible();
	await expect(widget.getByText("отправляется…")).toHaveCount(0);
	await expect(
		widget.locator("p", { hasText: "Пишу из-за прокси" }),
	).toHaveCount(1);
	await expect(widget.getByRole("button", { name: "Повторить" })).toHaveCount(
		0,
	);
	await expect(widget.getByText(/Нет связи/)).toHaveCount(0);
	await polling;

	await customer.context().close();
});
