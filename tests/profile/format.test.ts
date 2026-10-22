/**
 * Форматирование кабинета и колокольчика: склонения, «5 минут назад»,
 * монограмма, подписи роли и статуса, даты в поясе сайта.
 *
 *   pnpm test  (входит в общий набор)
 */

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { formatRelativeTime } from "../../src/modules/notifications/lib/formatRelativeTime.ts";
import {
	formatDate,
	formatDateTime,
	formatRelative,
	initialsOf,
	plural,
	pluralSessions,
	roleLabel,
	statusView,
} from "../../src/modules/profile/lib/format.ts";

const MIN = 60_000;
const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("склонение", () => {
	test("1, 2–4, 5–20, 21, 111, 112", () => {
		const f = (n: number) => plural(n, "минута", "минуты", "минут");
		assert.deepEqual(
			[0, 1, 2, 4, 5, 11, 12, 14, 20, 21, 22, 25, 101, 111, 112, 1001].map(f),
			[
				"минут",
				"минута",
				"минуты",
				"минуты",
				"минут",
				"минут",
				"минут",
				"минут",
				"минут",
				"минута",
				"минуты",
				"минут",
				"минута",
				"минут",
				"минут",
				"минута",
			],
		);
		assert.equal(pluralSessions(3), "устройства");
	});
});

describe("formatRelative (список устройств)", () => {
	test("границы шкалы", () => {
		const r = (ms: number) => formatRelative(ago(ms), NOW);
		assert.equal(r(0), "только что");
		assert.equal(r(59_999), "только что");
		assert.equal(r(MIN), "1 минуту назад");
		assert.equal(r(2 * MIN), "2 минуты назад");
		assert.equal(r(59 * MIN), "59 минут назад");
		assert.equal(r(60 * MIN), "1 час назад");
		assert.equal(r(23 * 60 * MIN), "23 часа назад");
		assert.equal(r(24 * 60 * MIN), "вчера");
		assert.equal(r(47 * 60 * MIN), "вчера");
		assert.equal(r(2 * 24 * 60 * MIN), "2 дня назад");
		assert.equal(r(6 * 24 * 60 * MIN), "6 дней назад");
		// Неделя и больше — абсолютная дата.
		assert.equal(r(7 * 24 * 60 * MIN), formatDateTime(ago(7 * 24 * 60 * MIN)));
	});

	test("будущее (часы клиента спешат) — «только что», мусор — прочерк", () => {
		assert.equal(formatRelative(ago(-5 * MIN), NOW), "только что");
		assert.equal(formatRelative("не дата", NOW), "—");
		assert.equal(formatDateTime("не дата"), "—");
		assert.equal(formatDate(""), "—");
	});

	test("абсолютные даты — в поясе сайта (Москва), а не процесса", () => {
		// 21:30 UTC — уже следующие сутки по Москве (UTC+3).
		assert.equal(formatDate("2026-10-21T21:30:00.000Z"), "22 октября 2026 г.");
		assert.match(formatDateTime("2026-10-21T21:30:00.000Z"), /22 окт.* 00:30/);
	});
});

describe("formatRelativeTime (колокольчик)", () => {
	const realNow = Date.now;
	afterEach(() => {
		Date.now = realNow;
	});

	test("минуты, часы, вчера, недели", () => {
		Date.now = () => NOW;
		assert.equal(formatRelativeTime(ago(10_000)), "только что");
		assert.equal(formatRelativeTime(ago(5 * MIN)), "5 минут назад");
		assert.equal(formatRelativeTime(ago(3 * 60 * MIN)), "3 часа назад");
		assert.equal(formatRelativeTime(ago(24 * 60 * MIN)), "вчера");
		assert.equal(formatRelativeTime(ago(14 * 24 * 60 * MIN)), "2 недели назад");
		assert.equal(formatRelativeTime(ago(-MIN)), "только что");
	});
});

describe("монограмма, роль, статус", () => {
	test("монограмма: две первые буквы имени, иначе — почты", () => {
		assert.equal(initialsOf("  анна   мария петрова ", "a@b.c"), "АМ");
		assert.equal(initialsOf("Иван", "a@b.c"), "И");
		assert.equal(initialsOf("   ", " zed@b.c"), "Z");
		assert.equal(initialsOf("", ""), "?");
	});

	test("роль: значения коллекции users (покупатель — user)", () => {
		assert.equal(roleLabel("user"), "Покупатель");
		assert.equal(roleLabel("admin"), "Администратор");
		assert.equal(roleLabel("superadmin"), "Суперадминистратор");
		assert.equal(roleLabel("lawyer"), "lawyer");
	});

	test("статус аккаунта: «активен» не показываем", () => {
		assert.equal(statusView("active"), null);
		assert.deepEqual(statusView("blocked"), {
			label: "Заблокирован",
			tone: "danger",
		});
		assert.equal(statusView("suspended")?.tone, "warn");
		assert.equal(statusView("pending")?.label, "Ожидает подтверждения");
		assert.deepEqual(statusView("archived"), {
			label: "archived",
			tone: "warn",
		});
	});
});
