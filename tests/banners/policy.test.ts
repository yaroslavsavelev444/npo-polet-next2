import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	BannerPolicy,
	BannerShowState,
} from "../../src/modules/banners/policy.ts";
import {
	DEFAULT_REPEAT_HOURS,
	decideShow,
	effectiveMaxImpressions,
	IMPORTANT_MAX_IMPRESSIONS,
	MAX_BACKOFF_HOURS,
	nextShowAt,
	outcomeReached,
} from "../../src/modules/banners/policy.ts";

/**
 * Политика повторного показа.
 *
 * Здесь решается, увидит ли человек баннер ВТОРОЙ раз, и это то место, где
 * проще всего случайно получить бесконечное преследование. Такое правило
 * обязано проверяться таблицей значений, а не наблюдением за продом.
 *
 * Запуск: pnpm test:banners
 */

const NOW = new Date("2026-06-15T12:00:00.000Z");

const policy = (patch: Partial<BannerPolicy> = {}): BannerPolicy => ({
	kind: "once",
	repeatAfterHours: null,
	maxImpressions: null,
	outcome: "cta_or_dwell",
	dwellSeconds: 5,
	...patch,
});

const state = (patch: Partial<BannerShowState> = {}): BannerShowState => ({
	impressions: 0,
	lastShownAt: null,
	outcomeReachedAt: null,
	nextEligibleAt: null,
	...patch,
});

const hoursBetween = (from: Date, to: Date) =>
	(to.getTime() - from.getTime()) / 3_600_000;

/* --------------------------------------------------------------- потолок --- */

test("«один раз» означает ровно один показ", () => {
	assert.equal(effectiveMaxImpressions(policy({ kind: "once" }), "normal"), 1);
	// Заданный вручную потолок у «одного раза» не читается: правило сильнее.
	assert.equal(
		effectiveMaxImpressions(
			policy({ kind: "once", maxImpressions: 9 }),
			"normal",
		),
		1,
	);
});

test("важный баннер без потолка получает страховочный, а не бесконечность", () => {
	assert.equal(
		effectiveMaxImpressions(policy({ kind: "interval" }), "important"),
		IMPORTANT_MAX_IMPRESSIONS,
	);
	assert.equal(
		effectiveMaxImpressions(policy({ kind: "until_outcome" }), "normal"),
		IMPORTANT_MAX_IMPRESSIONS,
	);
	// Обычный с интервалом — единственный случай без потолка: ограничителем
	// служит срок жизни самого баннера.
	assert.equal(
		effectiveMaxImpressions(policy({ kind: "interval" }), "normal"),
		null,
	);
});

/* ------------------------------------------------------------- решение --- */

test("достигнутая цель закрывает баннер при любой политике", () => {
	const decision = decideShow({
		policy: policy({ kind: "interval", repeatAfterHours: 1 }),
		importance: "normal",
		state: state({ impressions: 1, outcomeReachedAt: NOW }),
		now: NOW,
	});

	assert.deepEqual(decision, {
		showable: false,
		reason: "outcome-reached",
		nextEligibleAt: null,
	});
});

test("исчерпанный лимит объясняется лимитом, а не ожиданием", () => {
	const decision = decideShow({
		policy: policy({ kind: "limited", maxImpressions: 2 }),
		importance: "normal",
		state: state({ impressions: 2, nextEligibleAt: new Date("2027-01-01") }),
		now: NOW,
	});

	assert.equal(decision.showable, false);
	assert.equal(
		decision.showable === false && decision.reason,
		"impressions-exhausted",
	);
});

test("назначенный момент повтора соблюдается и снимается по его наступлении", () => {
	const later = new Date(NOW.getTime() + 3_600_000);
	const waiting = decideShow({
		policy: policy({ kind: "interval" }),
		importance: "normal",
		state: state({ impressions: 1, nextEligibleAt: later }),
		now: NOW,
	});
	assert.equal(
		waiting.showable === false && waiting.reason,
		"waiting-interval",
	);
	assert.deepEqual(waiting.showable === false && waiting.nextEligibleAt, later);

	const ready = decideShow({
		policy: policy({ kind: "interval" }),
		importance: "normal",
		state: state({ impressions: 1, nextEligibleAt: later }),
		now: new Date(later.getTime() + 1),
	});
	assert.equal(ready.showable, true);
});

/* --------------------------------------------------------- следующий раз --- */

test("однократный баннер никогда не назначает повтор", () => {
	assert.equal(
		nextShowAt({
			policy: policy({ kind: "once" }),
			importance: "normal",
			impressions: 1,
			outcomeReached: false,
			now: NOW,
		}),
		null,
	);
});

test("успех отменяет уже заслуженный повтор", () => {
	assert.equal(
		nextShowAt({
			policy: policy({ kind: "interval", repeatAfterHours: 1 }),
			importance: "normal",
			impressions: 1,
			outcomeReached: true,
			now: NOW,
		}),
		null,
	);
});

test("незаполненный интервал — сутки, а не час", () => {
	const at = nextShowAt({
		policy: policy({ kind: "limited", maxImpressions: 3 }),
		importance: "normal",
		impressions: 1,
		outcomeReached: false,
		now: NOW,
	});

	assert.ok(at);
	assert.equal(hoursBetween(NOW, at), DEFAULT_REPEAT_HOURS);
});

test("обычный баннер повторяется ровно так, как задал администратор", () => {
	for (const impressions of [1, 2, 3]) {
		const at = nextShowAt({
			policy: policy({ kind: "interval", repeatAfterHours: 6 }),
			importance: "normal",
			impressions,
			outcomeReached: false,
			now: NOW,
		});
		assert.ok(at);
		assert.equal(hoursBetween(NOW, at), 6, `показ №${impressions}`);
	}
});

test("важный баннер ждёт вдвое дольше с каждым повтором", () => {
	const wait = (impressions: number) => {
		const at = nextShowAt({
			policy: policy({
				kind: "until_outcome",
				repeatAfterHours: 24,
				maxImpressions: 5,
			}),
			importance: "important",
			impressions,
			outcomeReached: false,
			now: NOW,
		});
		assert.ok(at);
		return hoursBetween(NOW, at);
	};

	assert.equal(wait(1), 24);
	assert.equal(wait(2), 48);
	assert.equal(wait(3), 96);
});

test("выдержка упирается в потолок, а не растёт бесконечно", () => {
	const at = nextShowAt({
		policy: policy({
			kind: "interval",
			repeatAfterHours: 24,
			maxImpressions: 50,
		}),
		importance: "important",
		impressions: 20,
		outcomeReached: false,
		now: NOW,
	});

	assert.ok(at);
	assert.equal(hoursBetween(NOW, at), MAX_BACKOFF_HOURS);
});

test("исчерпанный потолок означает «больше никогда»", () => {
	assert.equal(
		nextShowAt({
			policy: policy({
				kind: "limited",
				maxImpressions: 3,
				repeatAfterHours: 12,
			}),
			importance: "normal",
			impressions: 3,
			outcomeReached: false,
			now: NOW,
		}),
		null,
	);
});

/* ------------------------------------------------------------- результат --- */

test("критерий успеха читается буквально", () => {
	const dwell = 6_000;
	const cases: [BannerPolicy["outcome"], boolean, number, boolean][] = [
		["cta", true, 0, true],
		["cta", false, dwell, false],
		["dwell", false, dwell, true],
		["dwell", true, 0, false],
		["cta_or_dwell", true, 0, true],
		["cta_or_dwell", false, dwell, true],
		["cta_or_dwell", false, 0, false],
	];

	for (const [outcome, ctaClicked, dwellMs, expected] of cases) {
		assert.equal(
			outcomeReached({ policy: policy({ outcome }), ctaClicked, dwellMs }),
			expected,
			`${outcome} / cta=${ctaClicked} / dwell=${dwellMs}`,
		);
	}
});

test("порог «прочитал» включительный", () => {
	const p = policy({ outcome: "dwell", dwellSeconds: 5 });
	assert.equal(
		outcomeReached({ policy: p, ctaClicked: false, dwellMs: 4_999 }),
		false,
	);
	assert.equal(
		outcomeReached({ policy: p, ctaClicked: false, dwellMs: 5_000 }),
		true,
	);
});
