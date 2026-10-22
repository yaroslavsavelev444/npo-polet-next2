import { execFileSync } from "node:child_process";
import path from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Вход и регистрация через Яндекс ID — все ветки, как их видит покупатель,
 * на моке oauth.yandex.ru (tests/e2e/mock-yandex.mjs).
 *
 *   pnpm test:e2e:yandex
 *
 * Автоматизирует ручной прогон из CHECKLIST.md (раздел 18): новый покупатель
 * с почтой Яндекса и с чужой почтой, повторный вход, существующий аккаунт
 * через код, кабинет (отвязать), отмена, Яндекс без почты, повтор callback,
 * открытый редирект. Коды из писем — scripts/e2e-otp-code.ts (почта выключена).
 */

const ROOT = path.resolve(__dirname, "../../..");
const RUN = Date.now().toString(36);
const EXISTING = {
	email: "e2e.yandex-existing@example.test",
	name: "Яндекс Существующий",
};
const CABINET = {
	email: "e2e.yandex-cabinet@example.test",
	password: "E2e-Yandex-Cabinet-2026!",
};

type YandexAccount = {
	id: string;
	email: string;
	firstName?: string;
};

/** Код из последнего письма нужного типа (перебор хеша в локальной базе). */
function otpCode(email: string, type: string): string {
	const raw = execFileSync(
		process.execPath,
		[
			"--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
			"--experimental-strip-types",
			path.join(ROOT, "scripts/e2e-otp-code.ts"),
			email,
			type,
		],
		{ cwd: ROOT, encoding: "utf8" },
	);
	const lines = raw.trim().split("\n");
	return lines[lines.length - 1];
}

async function freshPage(browser: Browser): Promise<Page> {
	const context = await browser.newContext();
	return context.newPage();
}

/** Баннер cookie лежит поверх нижнего края и перекрывает кнопки форм. */
async function dismissCookies(page: Page) {
	const button = page.getByRole("button", { name: "Только необходимые" });
	if (await button.isVisible().catch(() => false)) await button.click();
}

/** Экран согласия мока: какой аккаунт Яндекса «входит». */
async function approveOnYandex(
	page: Page,
	account: YandexAccount,
	decision: "Разрешить" | "Отмена" = "Разрешить",
) {
	await expect(page).toHaveURL(/127\.0\.0\.1:4610\/authorize/);
	await page.getByLabel("id").fill(account.id);
	await page.getByLabel("email").fill(account.email);
	await page.getByLabel("first_name").fill(account.firstName ?? "Иван");
	await page.getByLabel("last_name").fill("Тестов");
	await page.getByRole("button", { name: decision }).click();
}

/** Экран «Почти готово»: согласия и «Создать аккаунт». */
async function completeSignup(page: Page, account: YandexAccount) {
	await expect(page).toHaveURL(/\/auth\/yandex\/complete/);
	await expect(page.getByText("Почти готово")).toBeVisible();
	await dismissCookies(page);
	// Предзаполнено из Яндекса: имя и фамилия.
	await expect(page.getByLabel("Имя")).toHaveValue(
		`${account.firstName ?? "Иван"} Тестов`,
	);
	const boxes = page.getByRole("checkbox");
	for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
	await page.getByRole("button", { name: "Создать аккаунт" }).click();
}

/** Экран кода: шесть ячеек, отправка сама по последней цифре. */
async function enterCode(page: Page, email: string, type: string) {
	// Отдельная страница кода — после Яндекса; на /auth/login код
	// спрашивается в той же форме, адрес не меняется.
	const cells = page.getByRole("group", { name: "Код подтверждения" });
	await expect(cells).toBeVisible();
	await cells.getByRole("textbox").first().click();
	await page.keyboard.type(otpCode(email, type));
}

/**
 * Экран согласия перед привязкой: аккаунт принимал старую редакцию (или
 * никакую), а в действующей появился идентификатор Яндекс ID.
 */
async function acceptLinkConsent(page: Page) {
	await expect(page).toHaveURL(/\/auth\/yandex\/link/);
	await expect(
		page.getByRole("heading", { name: "Привязка Яндекс ID" }),
	).toBeVisible();
	await dismissCookies(page);
	const accept = page.getByRole("button", { name: "Принять и привязать" });
	await expect(accept).toBeDisabled();
	const boxes = page.getByRole("checkbox");
	for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
	await accept.click();
}

async function openSecurityTab(page: Page) {
	await page.goto("/profile?tab=security");
	await expect(
		page.getByRole("heading", { name: "Способы входа" }),
	).toBeVisible();
	return page.locator("section", {
		has: page.getByRole("heading", { name: "Способы входа" }),
	});
}

test.describe.configure({ mode: "serial" });

const yandexUser: YandexAccount = {
	id: `e2e-ya-${RUN}-1`,
	email: `e2e.yandex-new-${RUN}@yandex.ru`,
	firstName: "Ярослава",
};

test("новый покупатель с почтой Яндекса: кнопка → согласие → «Почти готово» → вход без пароля", async ({
	browser,
}) => {
	const page = await freshPage(browser);
	await page.goto("/auth/login");
	await dismissCookies(page);
	await page.getByRole("link", { name: "Войти с Яндекс ID" }).click();

	await approveOnYandex(page, yandexUser);
	// Почта на домене Яндекса — доверенная: кода нет.
	await completeSignup(page, yandexUser);
	await expect(page).not.toHaveURL(/\/auth\//);

	const methods = await openSecurityTab(page);
	await expect(
		methods.getByText("Не задан — вы входите через Яндекс ID"),
	).toBeVisible();
	await expect(
		methods.getByText(new RegExp(`Привязан как ${yandexUser.email}`)),
	).toBeVisible();
	// Последний способ входа отвязать нельзя.
	await expect(
		methods.getByRole("button", { name: "Отвязать" }),
	).toBeDisabled();
});

test("повторный вход тем же Яндексом — сразу в аккаунт; чужой next не уводит с сайта", async ({
	browser,
}) => {
	const page = await freshPage(browser);
	await page.goto(
		`/auth/yandex/start?next=${encodeURIComponent("//evil.example/steal")}`,
	);
	// Почту в Яндексе сменили — аккаунт тот же: связь по id, не по почте.
	await approveOnYandex(page, {
		...yandexUser,
		email: `e2e.yandex-changed-${RUN}@yandex.ru`,
	});
	await expect(page).not.toHaveURL(/\/auth\/yandex\/complete/);
	expect(new URL(page.url()).host).toBe("localhost:3000");

	const methods = await openSecurityTab(page);
	await expect(
		methods.getByText(new RegExp(`Привязан как ${yandexUser.email}`)),
	).toBeVisible();

	// Вход без нашего пароля и кода — но не бесшумный: колокольчик.
	await page
		.getByRole("button", { name: /Уведомления/ })
		.first()
		.click();
	await expect(
		page.getByText("Вход через Яндекс ID", { exact: true }).first(),
	).toBeVisible();
});

test("новый покупатель с чужой почтой — подтверждает её кодом", async ({
	browser,
}) => {
	const account = {
		id: `e2e-ya-${RUN}-2`,
		email: `e2e.yandex-other-${RUN}@example.test`,
	};
	const page = await freshPage(browser);
	await page.goto("/auth/yandex/start?next=/profile");
	await approveOnYandex(page, account);
	await expect(
		page.getByText("На эту почту придёт код — подтвердите, что она ваша."),
	).toBeVisible();
	await completeSignup(page, account);

	await enterCode(page, account.email, "email_verify");
	await expect(page).toHaveURL(/\/profile/);
	const methods = await openSecurityTab(page);
	await expect(
		methods.getByText(new RegExp(`Привязан как ${account.email}`)),
	).toBeVisible();
});

test("почта занята существующим аккаунтом — код, согласие, привязка; отвязка и повторная привязка из кабинета", async ({
	browser,
}) => {
	const page = await freshPage(browser);
	await page.goto("/auth/yandex/start?next=/profile");
	// Регистр почты в Яндексе другой — поиск аккаунта к нему нечувствителен.
	await approveOnYandex(page, {
		id: `e2e-ya-${RUN}-3`,
		email: EXISTING.email.toUpperCase(),
	});

	await expect(page.getByText(/Подтвердите/).first()).toBeVisible();
	// До кода сессии нет: кабинет возвращает на экран кода (proxy.ts,
	// незавершённый вход — «состояние №2»), а не пускает внутрь.
	const probe = await page.context().newPage();
	await probe.goto("/profile");
	await expect(probe).toHaveURL(/\/auth\/verify-otp/);
	await probe.close();

	await enterCode(page, EXISTING.email, "link_oauth");
	// Код верный — вошли, но привязки ещё нет: согласий у аккаунта нет.
	await acceptLinkConsent(page);
	await expect(page).toHaveURL(/\/profile/);

	let methods = await openSecurityTab(page);
	await expect(
		methods.getByText("Задан — можно входить по почте и паролю"),
	).toBeVisible();
	await expect(
		methods.getByText(/Привязан как e2e\.yandex-existing@example\.test/),
	).toBeVisible();
	await methods.getByRole("button", { name: "Отвязать" }).click();
	await expect(methods.getByText("Яндекс ID отвязан.")).toBeVisible();
	await expect(methods.getByText("Не привязан")).toBeVisible();

	// Повторная привязка из кабинета: короткая кнопка «Яндекс ID» (текст
	// кнопки менять нельзя), согласие уже принято — без экрана согласия.
	await methods.getByRole("link", { name: "Яндекс ID", exact: true }).click();
	await approveOnYandex(page, {
		id: `e2e-ya-${RUN}-3`,
		email: EXISTING.email,
	});
	await expect(page).toHaveURL(/\/profile\?tab=security/);
	methods = await openSecurityTab(page);
	await expect(methods.getByText(/Привязан как/)).toBeVisible();
});

test("привязка из кабинета к аккаунту без действующего согласия — сначала экран согласия", async ({
	browser,
}) => {
	const page = await freshPage(browser);
	await page.goto("/auth/login");
	await dismissCookies(page);
	// По id: метка «Email» есть ещё в подвале (подписка).
	await page.locator("#email").fill(CABINET.email);
	await page.locator("#password").fill(CABINET.password);
	await page.getByRole("button", { name: "Войти", exact: true }).click();
	await enterCode(page, CABINET.email, "login_2fa");
	await expect(page).not.toHaveURL(/\/auth\//);

	let methods = await openSecurityTab(page);
	await methods.getByRole("link", { name: "Яндекс ID", exact: true }).click();
	const account = {
		id: `e2e-ya-${RUN}-6`,
		email: `e2e.yandex-cab-${RUN}@ya.ru`,
	};
	await approveOnYandex(page, account);

	// Отказался — аккаунт как был, привязки нет.
	await expect(page).toHaveURL(/\/auth\/yandex\/link/);
	await page.getByRole("link", { name: "Не привязывать" }).click();
	methods = await openSecurityTab(page);
	await expect(methods.getByText("Не привязан")).toBeVisible();

	// Передумал — со второго раза согласие и привязка.
	await methods.getByRole("link", { name: "Яндекс ID", exact: true }).click();
	await approveOnYandex(page, account);
	await acceptLinkConsent(page);
	await expect(page).toHaveURL(/\/profile\?tab=security/);
	methods = await openSecurityTab(page);
	await expect(
		methods.getByText(new RegExp(`Привязан как ${account.email}`)),
	).toBeVisible();
});

test("отмена на экране Яндекса — «Вход отменён», входа нет", async ({
	browser,
}) => {
	const page = await freshPage(browser);
	await page.goto("/auth/yandex/start");
	await approveOnYandex(
		page,
		{ id: `e2e-ya-${RUN}-4`, email: `e2e.yandex-cancel-${RUN}@yandex.ru` },
		"Отмена",
	);
	await expect(page).toHaveURL(/\/auth\/login\?oauth_error=cancelled/);
	await expect(page.getByText("Вход через Яндекс ID отменён.")).toBeVisible();
});

test("Яндекс без почты — понятная ошибка, аккаунт не создаётся", async ({
	browser,
}) => {
	const page = await freshPage(browser);
	await page.goto("/auth/yandex/start");
	await approveOnYandex(page, { id: `e2e-ya-${RUN}-5`, email: "" });
	await expect(page).toHaveURL(/oauth_error=no_email/);
	await expect(
		page.getByText(/В вашем Яндекс ID не указана почта/),
	).toBeVisible();
});

test("повтор callback из журнала — «Время входа истекло», входа нет", async ({
	browser,
}) => {
	const page = await freshPage(browser);
	let callbackUrl = "";
	page.on("request", (request) => {
		if (request.url().includes("/auth/yandex/callback?")) {
			callbackUrl = request.url();
		}
	});
	await page.goto("/auth/yandex/start?next=/profile");
	await approveOnYandex(page, yandexUser);
	await expect(page).toHaveURL(/\/profile/);
	expect(callbackUrl).not.toBe("");

	// Тот же URL в чужом браузере: состояние уже сожжено (GETDEL), cookie
	// потока у него нет.
	const replay = await freshPage(browser);
	await replay.goto(callbackUrl);
	await expect(replay).toHaveURL(/oauth_error=expired/);
	await expect(
		replay.getByText("Время входа истекло. Попробуйте ещё раз."),
	).toBeVisible();
	await replay.goto("/profile");
	await expect(replay).toHaveURL(/\/auth\/login/);
});
