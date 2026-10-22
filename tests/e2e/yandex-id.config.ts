import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E входа и регистрации через Яндекс ID на моке oauth.yandex.ru.
 *
 *   pnpm test:e2e:yandex
 *
 * Отдельный конфиг, как у чата: нужны мок Яндекса (tests/e2e/mock-yandex.mjs)
 * и dev-сервер с ключами мок-приложения и адресами мока в env. Основной
 * конфиг этот спек игнорирует. Галочку «Вход через Яндекс ID» включает
 * globalSetup и возвращает как было globalTeardown.
 *
 * Мок на 127.0.0.1, витрина на localhost — возврат с «Яндекса» остаётся
 * cross-site навигацией, как в проде (proxy.ts, isCrossSitePageNavigation).
 */

const DIRNAME = __dirname;
const ROOT = path.resolve(DIRNAME, "../..");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MOCK_URL = "http://127.0.0.1:4610";

export default defineConfig({
	testDir: path.join(DIRNAME, "specs"),
	testMatch: /yandex-id\.spec\.ts/,
	outputDir: path.join(DIRNAME, ".output"),
	globalSetup: path.join(DIRNAME, "yandex-id.setup.ts"),
	globalTeardown: path.join(DIRNAME, "yandex-id.teardown.ts"),

	// Сценарии делят тестовые аккаунты и лимиты одного IP.
	fullyParallel: false,
	workers: 1,
	retries: 0,
	// Первый заход на холодный dev-сервер компилирует каждый роут /auth/yandex/*.
	timeout: 120_000,
	expect: { timeout: 15_000 },
	reporter: [["list"]],

	use: {
		baseURL: BASE_URL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		locale: "ru-RU",
		timezoneId: "Europe/Moscow",
	},

	projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],

	webServer: [
		{
			command: "node tests/e2e/mock-yandex.mjs",
			cwd: ROOT,
			port: 4610,
			reuseExistingServer: !process.env.CI,
			stdout: "ignore",
			stderr: "pipe",
		},
		{
			command: "node_modules/.bin/next dev",
			cwd: ROOT,
			url: BASE_URL,
			timeout: 240_000,
			reuseExistingServer: !process.env.CI,
			env: {
				EMAIL_ENABLED: "false",
				YANDEX_CLIENT_ID: "mock-client",
				YANDEX_CLIENT_SECRET: "mock-secret",
				YANDEX_OAUTH_URL: MOCK_URL,
				YANDEX_LOGIN_URL: MOCK_URL,
			},
			stdout: "ignore",
			stderr: "pipe",
		},
	],
});
