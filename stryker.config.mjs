// @ts-check
/**
 * Мутационное тестирование критичных зон (StrykerJS).
 *
 * Зоны — деньги (промокоды, итоги и цена заказа), доступ (редиректы,
 * доверенные устройства, границы прав Payload) и валидация оформления
 * (схема заказа, адрес, ИНН/ОГРН/КПП/ФИО). Остальной код намеренно не
 * мутируется: UI, коллекции и хуки Payload либо шумят, либо требуют БД.
 *
 * У Stryker нет раннера для node:test, поэтому используется command runner:
 * на каждого мутанта запускается узкий набор юнит-тестов этих зон
 * (≈1 с). Активный мутант передаётся через переменную окружения и
 * наследуется дочерними процессами `node --test`.
 *
 * Запуск: pnpm test:mutation (отчёт — reports/mutation/index.html).
 * Не в CI: прогон занимает минуты, запускать при изменениях в этих зонах.
 */

const NODE_TEST =
	"node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test";

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	testRunner: "command",
	commandRunner: {
		command: `${NODE_TEST} tests/promo/*.test.ts tests/checkout/*.test.ts tests/security/*.test.ts`,
	},
	coverageAnalysis: "off",
	mutate: [
		// Зона 1 — деньги
		"src/modules/promo/lib/promo-code.ts",
		"src/modules/promo/lib/promo-rules.ts",
		"src/modules/promo/lib/promo-resolution.ts",
		"src/modules/checkout/lib/checkout-totals.ts",
		"src/modules/checkout/lib/checkout-pricing.ts",
		// Зона 2 — безопасность и доступ
		"src/modules/auth/lib/safeRedirect.ts",
		"src/modules/auth/lib/trustedDevice.policy.ts",
		"src/modules/auth/lib/network.ts",
		"src/payload/access/ownership.ts",
		"src/payload/access/isAdmin.ts",
		"src/payload/access/isAdminOrSuperAdmin.ts",
		"src/payload/access/isSuperAdmin.ts",
		// Зона 3 — валидация оформления
		"src/modules/checkout/lib/checkout-schema.ts",
		"src/modules/checkout/lib/address.ts",
		"src/modules/checkout/lib/validate-*.ts",
	],
	// В песочницу копируется только нужное тестам, а не media/public/db.
	ignorePatterns: [
		"/*",
		"!/src",
		"!/tests",
		"/tests/e2e",
		"!/package.json",
		"!/tsconfig.json",
	],
	// Статические мутанты (константы уровня модуля: роли персонала, веса
	// контрольных сумм) здесь важны, а процесс и так новый на каждый прогон.
	ignoreStatic: false,
	concurrency: 6,
	// Достигнуто 90,5 %; остаток — в основном эквивалентные мутанты
	// (эшелонированные проверки, тексты сообщений). break ловит регресс.
	thresholds: { high: 90, low: 85, break: 85 },
	reporters: ["clear-text", "progress", "html", "json"],
	htmlReporter: { fileName: "reports/mutation/index.html" },
	jsonReporter: { fileName: "reports/mutation/mutation.json" },
	tempDirName: ".stryker-tmp",
};
