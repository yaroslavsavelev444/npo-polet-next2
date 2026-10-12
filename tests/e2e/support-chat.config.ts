import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E чата поддержки: покупатель на витрине и менеджер в консоли — два
 * браузерных контекста с разными сессиями.
 *
 *   pnpm test:e2e:support
 *
 * Отдельный конфиг, а не проект в playwright.config.ts: тому нужны сиды
 * оформления заказа и мок DaData, этому — шлюз Socket.IO и свои учётки.
 * Основной конфиг этот спек игнорирует.
 *
 * Результат не зависит от часа запуска: сценарий не проверяет ни текст
 * оценки «через сколько ответим», ни отсутствие автоответа в нерабочее
 * время — это делают интеграционные тесты с подменённым расписанием.
 */

const DIRNAME = __dirname;
const ROOT = path.resolve(DIRNAME, "../..");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const RESOLVER = "./tests/support/next-subpath-resolver.mjs";
const NODE = `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --import ${RESOLVER}`;

export default defineConfig({
	testDir: path.join(DIRNAME, "specs"),
	testMatch: /support-chat\.spec\.ts/,
	outputDir: path.join(DIRNAME, ".output"),
	globalSetup: path.join(DIRNAME, "support-chat.setup.ts"),

	fullyParallel: false,
	workers: 1,
	retries: 0,
	// Первый заход на холодный dev-сервер компилирует витрину и админку.
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
			command: `${NODE} src/modules/support-chat/gateway.ts`,
			cwd: ROOT,
			url: "http://localhost:3005/realtime/health",
			timeout: 60_000,
			reuseExistingServer: !process.env.CI,
			env: { EMAIL_ENABLED: "false" },
			stdout: "ignore",
			stderr: "pipe",
		},
		{
			command: "node_modules/.bin/next dev",
			cwd: ROOT,
			url: BASE_URL,
			timeout: 240_000,
			reuseExistingServer: !process.env.CI,
			env: { EMAIL_ENABLED: "false" },
			stdout: "ignore",
			stderr: "pipe",
		},
	],
});
