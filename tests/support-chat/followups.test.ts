/**
 * Чат поддержки: оценка ответа, распределение по срокам, уведомления —
 * разделы 8–10, на настоящих Postgres и Redis.
 *
 *   pnpm test:support-chat
 *
 * Расписание на время тестов подменяется на «открыто всегда» / «закрыто
 * всегда» — результат не должен зависеть от того, в котором часу их
 * запустили. Исходное расписание восстанавливается в teardown.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { sql } from "@payloadcms/db-postgres";
import { touchPresence } from "../../src/modules/support-chat/server/presence.ts";
import {
	buildSupportReport,
	percentile,
	summarizeFirstResponse,
} from "../../src/modules/support-chat/server/reports.ts";
import { normalizeSupportSettings } from "../../src/modules/support-chat/server/settings.ts";
import {
	MIN_SAMPLE,
	summarizeFirstResponses,
	typicalForNow,
} from "../../src/modules/support-chat/server/stats.ts";
import * as service from "../../src/modules/support-chat/server/support.service.ts";
import {
	ALWAYS_CLOSED,
	ALWAYS_OPEN,
	CONSENT_SLUG,
	deps,
	type Fixture,
	makeAgent,
	makeCustomer,
	recordingBroadcaster,
	setSettings,
	setupFixture,
	teardownFixture,
} from "./helpers.ts";

let fixture: Fixture;

before(async () => {
	fixture = await setupFixture();
});

after(async () => {
	await teardownFixture(fixture);
});

const consent = { document: CONSENT_SLUG };
const send = (body: string, extra: Record<string, unknown> = {}) => ({
	clientMessageId: randomUUID(),
	body,
	attachmentIds: [] as number[],
	...extra,
});
const staffReply = (conversationId: number, body: string) => ({
	conversationId,
	clientMessageId: randomUUID(),
	body,
	kind: "text" as const,
	attachmentIds: [] as number[],
	documentIds: [] as number[],
});

// ─── Статистика (чистая) ────────────────────────────────────────────────────

describe("статистика первого ответа", () => {
	const config = normalizeSupportSettings({
		timezone: "Europe/Moscow",
		schedule: [
			{ day: "fri", opensAt: "09:00", closesAt: "18:00" },
			{ day: "sat", opensAt: "09:00", closesAt: "18:00", slaMinutes: 60 },
		],
	});
	// Пятница 9 октября 2026, 12:00 МСК; суббота — 10 октября.
	const friday = (minute: number) => new Date(Date.UTC(2026, 9, 9, 9, minute));
	const saturday = (minute: number) =>
		new Date(Date.UTC(2026, 9, 10, 9, minute));
	const row = (start: Date, minutes: number) => ({
		createdAt: start,
		firstResponseAt: new Date(start.getTime() + minutes * 60_000),
	});

	test("медиана — отдельно для будней и выходных; ночные диалоги не в счёт", () => {
		const rows = [
			...[2, 4, 6, 8, 100].map((m, i) => row(friday(i), m)),
			...[30, 40, 50, 60, 70].map((m, i) => row(saturday(i), m)),
			row(new Date(Date.UTC(2026, 9, 9, 22, 0)), 600), // 01:00 МСК — нерабочее
		];
		const stats = summarizeFirstResponses(rows, config);
		assert.equal(stats.medianMinutes.weekday, 6);
		assert.equal(stats.medianMinutes.weekend, 50);
		assert.equal(stats.sample.weekday, 5);
	});

	test("мало данных — статистики нет, оценка будет по настройкам", () => {
		const stats = summarizeFirstResponses(
			Array.from({ length: MIN_SAMPLE - 1 }, (_, i) => row(friday(i), 3)),
			config,
		);
		assert.equal(stats.medianMinutes.weekday, null);
		assert.equal(typicalForNow(stats, config, friday(30)), null);
	});

	test("типичное время — для того интервала, который сейчас", () => {
		const stats = summarizeFirstResponses(
			[
				...[3, 3, 3, 3, 3].map((m, i) => row(friday(i), m)),
				...[45, 45, 45, 45, 45].map((m, i) => row(saturday(i), m)),
			],
			config,
		);
		assert.equal(typicalForNow(stats, config, friday(40)), 3);
		assert.equal(typicalForNow(stats, config, saturday(40)), 45);
	});
});

// ─── Оценка, автоответ, письма ──────────────────────────────────────────────

describe("после сообщения покупателя", () => {
	test("покупатель получает персональную оценку; место в очереди растёт", async () => {
		await setSettings(fixture, {
			schedule: ALWAYS_OPEN,
			routingMode: "manual",
		});
		try {
			const first = await makeCustomer(fixture, "eta1");
			const second = await makeCustomer(fixture, "eta2");
			const broadcaster = recordingBroadcaster();
			const d = deps(fixture, broadcaster);

			const a = await service.sendCustomerMessage(
				d,
				first,
				send("Первый", { consent }),
			);
			const b = await service.sendCustomerMessage(
				d,
				second,
				send("Второй", { consent }),
			);

			const etaEvent = broadcaster.events.find(
				(e) => e.room === `user:${second.userId}` && e.event === "eta:updated",
			);
			assert.ok(etaEvent, "оценка пришла покупателю");
			assert.equal(
				(etaEvent?.data as { eta: { online: boolean } }).eta.online,
				true,
			);

			// Ждущий дольше — не дальше в очереди, чем пришедший позже.
			const etaA = await service.getEta(d, new Date(), {
				conversationId: a.conversation.id,
			});
			const etaB = await service.getEta(d, new Date(), {
				conversationId: b.conversation.id,
			});
			assert.ok((etaA.minutes ?? 0) <= (etaB.minutes ?? 0));
		} finally {
			await setSettings(fixture, { routingMode: "auto" });
		}
	});

	test("вне рабочего времени — один автоответ на окно, а не на каждое сообщение", async () => {
		await setSettings(fixture, { schedule: ALWAYS_CLOSED });
		const customer = await makeCustomer(fixture, "offhours");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Ночью", { consent }),
		);
		await service.sendCustomerMessage(d, customer, send("Ещё ночью"));
		await service.sendCustomerMessage(d, customer, send("И ещё"));

		const page = await service.syncMessages(d, customer, {
			conversationId: conversation.id,
			afterSeq: 0,
		});
		const autoReplies = page.messages.filter(
			(m) => m.kind === "system" && /нерабочее время/i.test(m.body),
		);
		assert.equal(autoReplies.length, 1);
		await fixture.redis.del(`support:offhours:${conversation.id}`);
	});
});

describe("колокольчик «менеджер ответил»", () => {
	test("покупатель не на сайте — одно уведомление на несколько ответов, без текста", async () => {
		await setSettings(fixture, { schedule: ALWAYS_OPEN });
		const customer = await makeCustomer(fixture, "bell");
		const agent = await makeAgent(fixture, "Колокольчик");
		const offline = {
			...deps(fixture, recordingBroadcaster()),
			isUserOnline: async () => false,
		};
		const { conversation } = await service.sendCustomerMessage(
			offline,
			customer,
			send("Вопрос", { consent }),
		);

		await service.sendStaffMessage(
			offline,
			agent,
			staffReply(conversation.id, "Секретный ответ 4510"),
		);
		await service.sendStaffMessage(
			offline,
			agent,
			staffReply(conversation.id, "Ещё ответ"),
		);

		const rows = (await fixture.payload.db.drizzle.execute(sql`
			SELECT type, title, body FROM notifications WHERE user_id = ${customer.userId}
		`)) as unknown as { rows: { type: string; title: string; body: string }[] };
		const chat = rows.rows.filter((r) => r.type === "chat");
		assert.equal(chat.length, 1);
		assert.ok(
			!chat[0].body.includes("4510"),
			"текста ответа в уведомлении нет",
		);
	});

	test("покупатель на сайте — колокольчика нет", async () => {
		const customer = await makeCustomer(fixture, "nobell");
		const agent = await makeAgent(fixture, "БезКолокольчика");
		const online = {
			...deps(fixture, recordingBroadcaster()),
			isUserOnline: async () => true,
		};
		const { conversation } = await service.sendCustomerMessage(
			online,
			customer,
			send("Вопрос", { consent }),
		);
		await service.sendStaffMessage(
			online,
			agent,
			staffReply(conversation.id, "Ответ"),
		);

		const rows = (await fixture.payload.db.drizzle.execute(sql`
			SELECT 1 FROM notifications WHERE user_id = ${customer.userId} AND type = 'chat'
		`)) as unknown as { rows: unknown[] };
		assert.equal(rows.rows.length, 0);
	});
});

// ─── Обход: переназначение и эскалация ──────────────────────────────────────

describe("обход ждущих диалогов", () => {
	test("назначенный отошёл — диалог уходит тому, кто на месте", async () => {
		await setSettings(fixture, {
			schedule: ALWAYS_OPEN,
			routingMode: "manual",
		});
		const customer = await makeCustomer(fixture, "sweep");
		const away = await makeAgent(fixture, "Отошедшая");
		const present = await makeAgent(fixture, "НаМесте");
		const d = deps(fixture, recordingBroadcaster());

		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Срочно", { consent }),
		);
		await service.claimForStaff(d, away, conversation.id);
		await touchPresence(fixture.redis, away.adminId, { status: "away" });
		await touchPresence(fixture.redis, present.adminId, {
			status: "available",
		});
		await setSettings(fixture, { routingMode: "auto" });

		const result = await service.sweepAwaiting(d);
		assert.ok(result.reassigned >= 1);

		const view = await service.getForStaff(d, present, conversation.id);
		assert.notEqual(view.conversation.assigneeId, away.adminId);
		assert.ok(
			view.messages.some(
				(m) => m.kind === "note" && /Передан автоматически/.test(m.body),
			),
			"коллегам видно, почему передан",
		);
		await touchPresence(fixture.redis, present.adminId, { status: "away" });
	});

	test("ждёт дольше срока, передать некому — письмо персоналу, один раз", async () => {
		await setSettings(fixture, {
			schedule: ALWAYS_OPEN,
			routingMode: "manual",
		});
		try {
			const customer = await makeCustomer(fixture, "overdue");
			const d = deps(fixture, recordingBroadcaster());
			const { conversation } = await service.sendCustomerMessage(
				d,
				customer,
				send("Где ответ?", { consent }),
			);
			await fixture.payload.db.drizzle.execute(sql`
				UPDATE support_conversations
				SET awaiting_reply_since = now() - interval '45 minutes'
				WHERE id = ${conversation.id}
			`);

			const first = await service.sweepAwaiting(d);
			assert.ok(first.escalated >= 1);
			const keys = await fixture.redis.keys(
				`support:escalated:${conversation.id}:*`,
			);
			assert.equal(keys.length, 1, "эскалация отмечена");

			// Повторный обход по тому же ожиданию письма не шлёт: отметка уже есть
			// и не перезаписывается (SET NX), срок её жизни не сбрасывается.
			const ttlBefore = await fixture.redis.ttl(keys[0]);
			await service.sweepAwaiting(d);
			assert.ok((await fixture.redis.ttl(keys[0])) <= ttlBefore);
			for (const key of keys) await fixture.redis.del(key);
		} finally {
			await setSettings(fixture, { routingMode: "auto" });
		}
	});

	test("ночью обход ничего не перекладывает", async () => {
		await setSettings(fixture, { schedule: ALWAYS_CLOSED });
		const result = await service.sweepAwaiting(
			deps(fixture, recordingBroadcaster()),
		);
		assert.deepEqual(result, { reassigned: 0, queued: 0, escalated: 0 });
	});
});

// ─── Отчёты ─────────────────────────────────────────────────────────────────

describe("отчёты", () => {
	const config = {
		...normalizeSupportSettings({
			timezone: "Europe/Moscow",
			schedule: [
				{ day: "fri", opensAt: "09:00", closesAt: "18:00" },
				{ day: "sat", opensAt: "09:00", closesAt: "18:00", slaMinutes: 60 },
			],
		}),
	};
	// Пятница 9 октября 2026, 12:00 МСК; суббота — 10 октября.
	const friday = new Date(Date.UTC(2026, 9, 9, 9, 0));
	const saturday = new Date(Date.UTC(2026, 9, 10, 9, 0));
	const night = new Date(Date.UTC(2026, 9, 9, 22, 0));
	const plus = (date: Date, minutes: number) =>
		new Date(date.getTime() + minutes * 60_000);

	test("percentile — с интерполяцией, как percentile_cont", () => {
		assert.equal(percentile([], 50), null);
		assert.equal(percentile([10], 90), 10);
		assert.equal(percentile([1, 2, 3, 4], 50), 2.5);
		assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9.1);
	});

	test("срок — по интервалу начала; ночь и неответившие в пределах срока не в счёт", () => {
		const now = plus(friday, 600);
		const result = summarizeFirstResponse(
			[
				{ createdAt: friday, firstResponseAt: plus(friday, 10), assigneeId: 1 },
				{ createdAt: friday, firstResponseAt: plus(friday, 20), assigneeId: 2 },
				// Суббота: срок 60 — 40 минут не нарушение.
				{
					createdAt: saturday,
					firstResponseAt: plus(saturday, 40),
					assigneeId: 1,
				},
				// Ночь: ни в выборку, ни в срок.
				{ createdAt: night, firstResponseAt: plus(night, 600), assigneeId: 1 },
				// Без ответа, срок вышел — нарушение.
				{
					createdAt: plus(friday, 30),
					firstResponseAt: null,
					assigneeId: null,
				},
				// Без ответа, срок не вышел — исход неизвестен.
				{ createdAt: plus(now, -5), firstResponseAt: null, assigneeId: null },
			],
			config,
			now,
		);
		assert.deepEqual(result.all, [10, 20, 40]);
		assert.deepEqual(result.byAgent.get(1), [10, 40]);
		assert.equal(result.slaSample, 4);
		assert.equal(result.slaBreaches, 2);
	});

	test("отчёт за период: диалог, ответ, оценка и метка — в цифрах, без текста", async () => {
		// Ручное распределение и явное «Взять»: иначе диалог автоматически уходит
		// менеджеру «на месте» из соседнего теста, и строка отчёта — не наша.
		await setSettings(fixture, {
			schedule: ALWAYS_OPEN,
			routingMode: "manual",
		});
		const customer = await makeCustomer(fixture, "report");
		const agent = await makeAgent(fixture, "Отчётная");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Секретный вопрос 7731", { consent, topic: "payment" }),
		);
		await service.claimForStaff(d, agent, conversation.id);
		await service.sendStaffMessage(
			d,
			agent,
			staffReply(conversation.id, "Ответ"),
		);
		await service.setTagsForStaff(d, agent, {
			conversationId: conversation.id,
			tags: ["отчёт-тест"],
		});
		await service.resolveForStaff(d, agent, conversation.id);
		await service.submitCsat(d, customer, {
			conversationId: conversation.id,
			score: 4,
		});

		const report = await buildSupportReport(fixture.payload, 7);
		assert.ok(report.totals.conversations >= 1);
		assert.ok(report.topics.some((t) => t.topic === "payment"));
		assert.ok(report.tags.some((t) => t.tag === "отчёт-тест"));
		assert.ok(report.csat.distribution[3] >= 1);
		const row = report.agents.find((a) => a.adminId === agent.adminId);
		assert.equal(row?.conversations, 1);
		assert.equal(row?.messages, 1);
		assert.equal(row?.csatAverage, 4);
		assert.equal(report.heatmap.length, 7);
		assert.ok(report.heatmap.flat().reduce((a, b) => a + b, 0) >= 1);
		assert.ok(!JSON.stringify(report).includes("7731"), "текста в отчёте нет");

		// «Подсказывается, но не используется»: общие, ≥ 5 подсказок, < 20 %.
		const canned = async (
			key: string,
			data: Record<string, unknown>,
		): Promise<number> => {
			const doc = await fixture.payload.create({
				collection: "support-canned-responses",
				data: {
					title: `Отчёт ${key} ${agent.adminId}`,
					body: "Текст заготовки.",
					scope: "shared",
					...data,
				},
				overrideAccess: true,
			});
			return Number(doc.id);
		};
		const ids = [
			await canned("шум", { suggestedCount: 40, usageCount: 2 }),
			await canned("никогда", { suggestedCount: 10, usageCount: 0 }),
			await canned("в-ходу", { suggestedCount: 10, usageCount: 5 }),
			await canned("мало-подсказок", { suggestedCount: 4, usageCount: 0 }),
			await canned("выключена", {
				suggestedCount: 50,
				usageCount: 0,
				isActive: false,
			}),
			await canned("личная", {
				suggestedCount: 50,
				usageCount: 0,
				scope: "personal",
				owner: agent.adminId,
			}),
		];
		try {
			const { cannedUnderused } = await buildSupportReport(fixture.payload, 7);
			const mine = cannedUnderused.filter((c) => ids.includes(c.id));
			assert.deepEqual(
				mine.map((c) => [c.id, c.suggested, c.used, c.lastUsedAt]),
				[
					[ids[1], 10, 0, null],
					[ids[0], 40, 2, null],
				],
				"по доле: сначала «никогда», потом «шум»",
			);
			assert.equal(mine[1].ratio, 0.05);
		} finally {
			await fixture.payload.db.drizzle.execute(
				sql`DELETE FROM support_canned_responses WHERE id IN (${sql.join(
					ids.map((id) => sql`${id}`),
					sql`, `,
				)})`,
			);
		}

		const live = await service.supportLive(d);
		assert.equal(typeof live.queue, "number");
		assert.ok(live.agents.some((a) => a.adminId === agent.adminId));
	});
});
