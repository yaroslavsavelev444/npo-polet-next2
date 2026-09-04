import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-конфигурация оформления заказа.
 *
 * Playwright установлен в изолированный каталог tests/e2e/.runner, а не в
 * node_modules проекта: CI ставит зависимости с --frozen-lockfile, и
 * добавление браузерного раннера в основной lock-файл потребовало бы
 * пересборки всего дерева на каждой машине ради тестов, которые в этом CI
 * пока не запускаются. Установка: pnpm e2e:install.
 *
 * Поднимаются ДВА сервера:
 *  1. mock-dadata — локальная замена апстрима подсказок. Благодаря ей тесты
 *     проходят весь путь запроса (браузер → наш роут → апстрим) без сети и
 *     без расхода дневной квоты DaData.
 *  2. next dev — само приложение, с ключом подсказок и адресом мока в env.
 */

// Playwright исполняет конфиг и тесты как CommonJS, поэтому здесь
// используется __dirname, а не import.meta.url.
const DIRNAME = __dirname;
const ROOT = path.resolve(DIRNAME, "../..");

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MOCK_PORT = process.env.MOCK_DADATA_PORT ?? "4599";
const DADATA_API_KEY = "e2e-test-key";

export default defineConfig({
	testDir: path.join(DIRNAME, "specs"),
	outputDir: path.join(DIRNAME, ".output"),
	globalSetup: path.join(DIRNAME, "global-setup.ts"),

	// Оформление заказа меняет общее состояние (корзина, сохранённые
	// предпочтения, номера заказов) у ОДНОГО тестового пользователя.
	// Параллельные воркеры гонялись бы за одну корзину и давали бы
	// нестабильные результаты, не связанные с кодом.
	fullyParallel: false,
	workers: 1,

	// Повторы отключены намеренно: повтор прячет настоящую нестабильность,
	// а именно её и нужно увидеть в тестах критичного бизнес-процесса.
	retries: 0,
	timeout: 45_000,
	expect: { timeout: 10_000 },

	reporter: process.env.CI
		? [
				["list"],
				[
					"html",
					{ outputFolder: path.join(DIRNAME, ".report"), open: "never" },
				],
			]
		: [["list"]],

	use: {
		baseURL: BASE_URL,
		storageState: path.join(DIRNAME, ".auth/state.json"),
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
		locale: "ru-RU",
		timezoneId: "Europe/Moscow",
	},

	projects: [
		{ name: "desktop", use: { ...devices["Desktop Chrome"] } },
		// Мобильная раскладка проверяется отдельно: сводка ошибок и список
		// подсказок ведут себя на узком экране иначе (панель подтверждения
		// уезжает под форму, список подсказок перекрывает поля).
		{
			name: "mobile",
			use: { ...devices["Pixel 7"] },
			testMatch: /(validation|autocomplete)\.spec\.ts/,
		},
	],

	webServer: [
		{
			command: `node ${path.join(DIRNAME, "mock-dadata.mjs")}`,
			port: Number(MOCK_PORT),
			reuseExistingServer: !process.env.CI,
			env: { DADATA_API_KEY, MOCK_DADATA_PORT: MOCK_PORT },
			stdout: "ignore",
			stderr: "pipe",
		},
		{
			// Прямой запуск бинарника, а не `pnpm dev`: pnpm перед скриптом
			// сверяет node_modules с lock-файлом и в неинтерактивной среде
			// падает, если дерево ставилось другой машиной или другим
			// пользователем. Тестам эта проверка не нужна.
			command: "node_modules/.bin/next dev",
			cwd: ROOT,
			url: BASE_URL,
			// Первый запуск dev-сервера компилирует страницы по требованию —
			// на холодную это заметно дольше обычного старта.
			timeout: 240_000,
			reuseExistingServer: !process.env.CI,
			env: {
				DADATA_API_KEY,
				DADATA_SUGGEST_URL: `http://127.0.0.1:${MOCK_PORT}/suggest`,
			},
			stdout: "ignore",
			stderr: "pipe",
		},
	],
});
