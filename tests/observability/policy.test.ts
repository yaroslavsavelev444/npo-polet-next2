import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
	cooldownSeconds,
	evaluate,
	isBurstMilestone,
	passesFilters,
	resetLocalPolicyState,
} from "../../src/services/observability/policy.ts";
import { parseAlertingSettings } from "../../src/services/observability/settings.ts";
import { DEFAULT_ALERTING_SETTINGS } from "../../src/services/observability/types.ts";

/**
 * Решение «слать или молчать». Redis в этом прогоне недоступен намеренно
 * (модуль подключения не разрешается без резолвера алиасов), поэтому
 * evaluate работает на запасном механизме в памяти — той же арифметикой.
 *
 * Запуск: pnpm test:observability
 */

const S = DEFAULT_ALERTING_SETTINGS;

beforeEach(() => resetLocalPolicyState());

test("пауза удваивается от базы до потолка", () => {
	assert.deepEqual(
		[0, 1, 2, 3, 20, 40].map((n) => cooldownSeconds(n, S)),
		[60, 120, 240, 480, 21_600, 21_600],
	);
});

test("всплеск — только 100, 1000, 10000", () => {
	const hits = [99, 100, 101, 500, 1000, 1001, 10_000].filter(isBurstMilestone);
	assert.deepEqual(hits, [100, 1000, 10_000]);
});

test("предупреждения по умолчанию не отправляются", () => {
	assert.equal(passesFilters("warning", "restock", S), "below-threshold");
	const warnings = { ...S, severityThreshold: "warning" as const };
	assert.equal(
		passesFilters("warning", "restock", warnings),
		"warnings-disabled",
	);
	const allowed = {
		...warnings,
		warnings: { enabled: true, allowedModules: ["restock"] },
	};
	assert.equal(passesFilters("warning", "restock/worker", allowed), null);
	assert.equal(
		passesFilters("warning", "checkout", allowed),
		"module-not-allowed",
	);
	assert.equal(passesFilters("fatal", undefined, S), null);
});

test("первая — сразу, повторы в паузе — молча, после паузы — сводка", async () => {
	const t0 = new Date("2026-09-28T10:00:00Z");
	const first = await evaluate("fp1", "error", "m", S, t0);
	assert.ok(first.send);
	assert.equal(first.stats.trigger, "new");
	assert.equal(first.stats.degraded, true);

	for (let i = 1; i <= 5; i++) {
		const repeat = await evaluate(
			"fp1",
			"error",
			"m",
			S,
			new Date(t0.getTime() + i * 1000),
		);
		assert.deepEqual(repeat, { send: false, reason: "cooldown" });
	}

	const later = await evaluate(
		"fp1",
		"error",
		"m",
		S,
		new Date(t0.getTime() + 61_000),
	);
	assert.ok(later.send);
	assert.equal(later.stats.trigger, "cooldown-expired");
	assert.equal(later.stats.occurrences, 7);
	assert.equal(later.stats.suppressed, 5);
});

test("часовой лимит: последнее письмо об этом говорит", async () => {
	const settings = { ...S, maxMessagesPerHour: 2 };
	const t0 = new Date("2026-09-28T10:00:00Z");
	const a = await evaluate("a", "error", "m", settings, t0);
	const b = await evaluate("b", "error", "m", settings, t0);
	const c = await evaluate("c", "error", "m", settings, t0);
	assert.ok(a.send && !a.stats.budgetExhausted);
	assert.ok(b.send && b.stats.budgetExhausted);
	assert.deepEqual(c, { send: false, reason: "hourly-budget" });
});

test("настройки: пустой глобал — умолчания, мусор — в границы", () => {
	assert.deepEqual(parseAlertingSettings(null), S);
	const parsed = parseAlertingSettings({
		maxMessagesPerHour: 0,
		cooldownBaseSeconds: 600,
		cooldownMaxSeconds: 60,
		severityThreshold: "nonsense",
		warningsModules: "restock\n\n  checkout  ",
		emailEnabled: false,
	});
	assert.equal(parsed.maxMessagesPerHour, 1);
	assert.equal(parsed.cooldownMaxSeconds, 600);
	assert.equal(parsed.severityThreshold, "error");
	assert.deepEqual(parsed.warnings.allowedModules, ["restock", "checkout"]);
	assert.equal(parsed.emailEnabled, false);
});
