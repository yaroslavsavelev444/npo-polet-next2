import { execFileSync } from "node:child_process";
import path from "node:path";

// Playwright исполняет конфиг и тесты как CommonJS, поэтому здесь
// используется __dirname, а не import.meta.url.
const DIRNAME = __dirname;
const ROOT = path.resolve(DIRNAME, "../..");

/**
 * Готовит стенд до запуска браузера: справочники, товары, тестовый
 * покупатель с активной сессией, корзина и два ИСТОРИЧЕСКИХ заказа со
 * старыми форматами адреса.
 *
 * Сиды выполняются здесь, а не в фикстуре теста, потому что они создают
 * storageState — файл с cookies, который Playwright читает при старте
 * контекста, то есть ещё до первого теста.
 */
export default function globalSetup(): void {
	execFileSync(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(ROOT, "scripts/seed-checkout-e2e.ts"),
		],
		{ cwd: ROOT, stdio: "inherit" },
	);
}
