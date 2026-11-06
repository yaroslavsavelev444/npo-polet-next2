/**
 * Аналитика заказов без базы: разбор параметров, периоды и сравнение, шаг
 * графика, право доступа.
 *
 *   pnpm test  (входит в общий набор)
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canViewOrderAnalytics } from "../../src/modules/order-analytics/lib/access.ts";
import {
	AnalyticsQueryError,
	addDays,
	daysInRange,
	parseAnalyticsQuery,
	resolveCompareRange,
	resolveGranularity,
	resolvePeriod,
	shiftYear,
	todayInAnalyticsZone,
} from "../../src/modules/order-analytics/lib/query.ts";

describe("право на аналитику", () => {
	test("персонал с ролью — да", () => {
		assert.equal(
			canViewOrderAnalytics({ collection: "admins", role: "admin" }),
			true,
		);
		assert.equal(
			canViewOrderAnalytics({ collection: "admins", role: "superadmin" }),
			true,
		);
	});

	test("покупатель — нет, даже с ролью superadmin в своей записи", () => {
		assert.equal(
			canViewOrderAnalytics({ collection: "users", role: "superadmin" }),
			false,
		);
		assert.equal(
			canViewOrderAnalytics({ collection: "users", role: "user" }),
			false,
		);
	});

	test("гость и учётка персонала без известной роли — нет", () => {
		assert.equal(canViewOrderAnalytics(null), false);
		assert.equal(canViewOrderAnalytics(undefined), false);
		assert.equal(canViewOrderAnalytics({ collection: "admins" }), false);
		assert.equal(
			canViewOrderAnalytics({ collection: "admins", role: "manager" }),
			false,
		);
	});
});

describe("периоды", () => {
	const today = "2026-11-06";

	test("последние N дней включают сегодня и ровно N дней", () => {
		const range = resolvePeriod("7d", today) as { from: string; to: string };
		assert.deepEqual(range, { from: "2026-10-31", to: today });
		assert.equal(daysInRange(range), 7);
		assert.equal(
			daysInRange(resolvePeriod("30d", today) as { from: string; to: string }),
			30,
		);
	});

	test("календарные периоды", () => {
		assert.deepEqual(resolvePeriod("mtd", today), {
			from: "2026-11-01",
			to: today,
		});
		assert.deepEqual(resolvePeriod("last_month", today), {
			from: "2026-10-01",
			to: "2026-10-31",
		});
		assert.deepEqual(resolvePeriod("qtd", today), {
			from: "2026-10-01",
			to: today,
		});
		assert.deepEqual(resolvePeriod("ytd", today), {
			from: "2026-01-01",
			to: today,
		});
		assert.deepEqual(resolvePeriod("last_year", today), {
			from: "2025-01-01",
			to: "2025-12-31",
		});
	});

	test("прошлый месяц в январе — декабрь прошлого года", () => {
		assert.deepEqual(resolvePeriod("last_month", "2026-01-15"), {
			from: "2025-12-01",
			to: "2025-12-31",
		});
	});

	test("«всё время» оставляет начало на сервер", () => {
		assert.deepEqual(resolvePeriod("all", today), { from: null, to: today });
	});

	test("свой период проверяется", () => {
		assert.deepEqual(
			resolvePeriod("custom", today, { from: "2026-01-01", to: "2026-01-31" }),
			{ from: "2026-01-01", to: "2026-01-31" },
		);
		for (const custom of [
			{},
			{ from: "2026-02-30", to: "2026-03-01" },
			{ from: "2026-03-02", to: "2026-03-01" },
			{ from: "01.01.2026", to: "2026-03-01" },
		]) {
			assert.throws(
				() => resolvePeriod("custom", today, custom),
				AnalyticsQueryError,
			);
		}
	});

	test("сегодня считается в поясе магазина, а не сервера", () => {
		// 21:30 UTC 31 декабря — в Москве уже 1 января.
		assert.equal(
			todayInAnalyticsZone(new Date("2025-12-31T21:30:00Z")),
			"2026-01-01",
		);
	});
});

describe("сравнение периодов", () => {
	test("предыдущий — той же длины, сразу перед выбранным, без пересечения", () => {
		const range = { from: "2026-03-01", to: "2026-03-31" };
		const compare = resolveCompareRange(range, "previous");
		assert.deepEqual(compare, { from: "2026-01-29", to: "2026-02-28" });
		assert.equal(daysInRange(compare as typeof range), daysInRange(range));
		assert.equal(addDays((compare as typeof range).to, 1), range.from);
	});

	test("прошлый год — те же даты", () => {
		assert.deepEqual(
			resolveCompareRange({ from: "2026-03-01", to: "2026-03-31" }, "year"),
			{ from: "2025-03-01", to: "2025-03-31" },
		);
	});

	test("29 февраля на год назад — 28 февраля", () => {
		assert.equal(shiftYear("2024-02-29"), "2023-02-28");
	});

	test("без сравнения — нет периода", () => {
		assert.equal(
			resolveCompareRange({ from: "2026-03-01", to: "2026-03-31" }, "none"),
			null,
		);
	});
});

describe("шаг графика", () => {
	test("авто выбирает шаг по длине периода", () => {
		assert.equal(resolveGranularity("auto", 30), "day");
		assert.equal(resolveGranularity("auto", 62), "day");
		assert.equal(resolveGranularity("auto", 90), "week");
		assert.equal(resolveGranularity("auto", 365), "month");
	});

	test("ручной шаг загрубляется на длинных периодах: точек не тысячи", () => {
		assert.equal(resolveGranularity("day", 90), "day");
		assert.equal(resolveGranularity("day", 800), "week");
		assert.equal(resolveGranularity("day", 3000), "month");
		assert.equal(resolveGranularity("week", 3000), "month");
		assert.equal(resolveGranularity("month", 10), "month");
	});
});

describe("разбор параметров", () => {
	const now = new Date("2026-11-06T09:00:00Z");
	const parse = (query: string) =>
		parseAnalyticsQuery(new URLSearchParams(query), now);

	test("значения по умолчанию", () => {
		const query = parse("");
		assert.equal(query.section, "overview");
		assert.equal(query.period, "30d");
		assert.equal(query.compareMode, "previous");
		assert.equal(query.granularity, "auto");
		assert.equal(query.filters.statuses, null);
		assert.equal(query.products.page, 1);
		assert.equal(query.products.sort, "revenue");
	});

	test("группы и отдельные статусы", () => {
		assert.deepEqual(parse("status=delivered").filters.statuses, ["delivered"]);
		assert.deepEqual(parse("status=void").filters.statuses, [
			"cancelled",
			"refunded",
		]);
		assert.ok(parse("status=valid").filters.statuses?.includes("delivered"));
		assert.ok(!parse("status=valid").filters.statuses?.includes("cancelled"));
	});

	test("значения вне белого списка — ошибка запроса, а не пустой отчёт", () => {
		for (const query of [
			"section=secret",
			"period=forever",
			"status=hacked",
			"customerType=robot",
			"delivery=x",
			"payment=x",
			"paymentStatus=x",
			"source=x",
			"sort=password",
			"dir=sideways",
			"compare=x",
			"granularity=x",
			"category=1;DROP",
			"category=-1",
			`region=${"x".repeat(201)}`,
		]) {
			assert.throws(() => parse(query), AnalyticsQueryError, query);
		}
	});

	test("плохая страница не ломает запрос", () => {
		assert.equal(parse("page=-5").products.page, 1);
		assert.equal(parse("page=abc").products.page, 1);
		assert.equal(parse("page=3").products.page, 3);
	});
});
