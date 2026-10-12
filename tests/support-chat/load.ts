/**
 * Нагрузочный прогон чата поддержки против ЗАПУЩЕННОГО шлюза — раздел 15.
 *
 *   pnpm support:gateway                 # в другом терминале
 *   pnpm test:support-chat:load          # 300 сокетов, 10 сообщений/с, 60 с
 *
 * Параметры — переменными окружения:
 *   LOAD_GATEWAY_URL   адрес шлюза            (http://localhost:3005)
 *   LOAD_ORIGIN        Origin витрины         (http://localhost:3000)
 *   LOAD_USERS         покупателей            (60)
 *   LOAD_TABS          вкладок на покупателя  (5)
 *   LOAD_STAFF         менеджеров в консоли   (3)
 *   LOAD_RATE          сообщений в секунду    (10)
 *   LOAD_SECONDS       длительность           (60)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ИЗМЕРЯЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 *  • ack — от emit до подтверждения шлюзом (запись в Postgres под блокировкой
 *    строки диалога, шифрование, рассылка);
 *  • доставка — от emit до `message:new` у КАЖДОГО менеджера и у всех
 *    вкладок того же покупателя (включая отправившую), то есть путь через redis-adapter;
 *  • память шлюза — из /realtime/health до, на пике и после.
 *
 * Порог из чеклиста: доставка p95 < 300 мс. Скрипт завершается с кодом 1,
 * если порог превышен или потеряно хоть одно сообщение.
 *
 * Покупатели и менеджеры создаются тем же fixture, что и в интеграционных
 * тестах, и убираются за собой вместе с переписками. Каждый покупатель пишет
 * ~раз в 6 секунд — внутри лимита шлюза (20 в минуту); упереться в лимит
 * здесь значило бы мерить не то.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { io as connect, type Socket } from "socket.io-client";
import type { AckResult } from "../../src/modules/support-chat/lib/events.ts";
import { SOCKET_PATH } from "../../src/modules/support-chat/server/gateway/server.ts";
import {
	CONSENT_SLUG,
	type Fixture,
	makeAgent,
	makeCustomer,
	sessionCookie,
	setupFixture,
	teardownFixture,
} from "./helpers.ts";

const env = (name: string, fallback: number) =>
	Number(process.env[name] ?? fallback);
const GATEWAY = process.env.LOAD_GATEWAY_URL ?? "http://localhost:3005";
const ORIGIN = process.env.LOAD_ORIGIN ?? "http://localhost:3000";
const USERS = env("LOAD_USERS", 60);
const TABS = env("LOAD_TABS", 5);
const STAFF = env("LOAD_STAFF", 3);
const RATE = env("LOAD_RATE", 10);
const SECONDS = env("LOAD_SECONDS", 60);
const P95_LIMIT_MS = 300;

interface Health {
	connections: number;
	rssMb?: number;
	heapMb?: number;
}

async function health(): Promise<Health> {
	const response = await fetch(`${GATEWAY}/realtime/health`);
	return (await response.json()) as Health;
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[
		Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
	];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Подключиться; «чат выключен» — повторять: setupFixture только что включил
 * чат, а шлюз держит настройки в кэше до 30 секунд.
 */
async function open(cookie: string): Promise<Socket> {
	for (let attempt = 0; ; attempt++) {
		const socket = connect(GATEWAY, {
			path: SOCKET_PATH,
			transports: ["websocket"],
			extraHeaders: { cookie, origin: ORIGIN },
			reconnection: false,
			forceNew: true,
		});
		try {
			await new Promise<void>((resolve, reject) => {
				socket.once("connect", () => resolve());
				socket.once("connect_error", reject);
			});
			return socket;
		} catch (error) {
			socket.close();
			const code = (error as { data?: { code?: string } }).data?.code;
			if (code !== "disabled" || attempt > 40) throw error;
			await sleep(1_000);
		}
	}
}

async function main() {
	let fixture: Fixture | null = null;
	const sockets: Socket[] = [];
	let failed = false;

	try {
		const before = await health().catch(() => {
			throw new Error(
				`Шлюз не отвечает на ${GATEWAY}/realtime/health — запустите pnpm support:gateway`,
			);
		});
		fixture = await setupFixture();
		const f = fixture;

		console.log(
			`Готовлю ${USERS} покупателей × ${TABS} вкладок + ${STAFF} менеджеров…`,
		);
		const customers = await Promise.all(
			Array.from({ length: USERS }, async (_, i) => {
				const actor = await makeCustomer(f, `load${i}`);
				return { actor, cookie: await sessionCookie(f, "users", actor.email) };
			}),
		);
		const agents = await Promise.all(
			Array.from({ length: STAFF }, async (_, i) => {
				const actor = await makeAgent(f, `Нагрузка${i}`);
				return { actor, cookie: await sessionCookie(f, "admins", actor.email) };
			}),
		);

		// sentAt: id → время отправки; ждём доставку каждому менеджеру и
		// каждой вкладке покупателя.
		const sentAt = new Map<string, number>();
		const pending = new Map<string, number>();
		const delivery: number[] = [];
		const ack: number[] = [];
		const errors = new Map<string, number>();

		const onMessage = (data: { body?: string }) => {
			const id = /^load:(\S+)/.exec(data.body ?? "")?.[1];
			if (!id) return;
			const start = sentAt.get(id);
			if (start === undefined) return;
			delivery.push(performance.now() - start);
			const left = (pending.get(id) ?? 0) - 1;
			if (left <= 0) pending.delete(id);
			else pending.set(id, left);
		};

		const connectStarted = performance.now();
		await Promise.all(
			agents.map(async (agent) => {
				const socket = await open(agent.cookie);
				socket.on("message:new", onMessage);
				sockets.push(socket);
			}),
		);
		const customerTabs = await Promise.all(
			customers.map(async (customer) => {
				const tabs: Socket[] = [];
				for (let t = 0; t < TABS; t++) {
					const socket = await open(customer.cookie);
					socket.on("message:new", onMessage);
					sockets.push(socket);
					tabs.push(socket);
				}
				return tabs;
			}),
		);
		const connectMs = performance.now() - connectStarted;
		const peakBefore = await health();
		console.log(
			`Сокетов: ${peakBefore.connections} (подключение ${Math.round(connectMs)} мс). Шлю ${RATE}/с в течение ${SECONDS} с…`,
		);

		const consented = new Set<number>();
		const total = RATE * SECONDS;
		const interval = 1_000 / RATE;
		const started = performance.now();
		let peak = peakBefore;
		const inflight: Promise<void>[] = [];

		for (let n = 0; n < total; n++) {
			const index = n % USERS;
			const tab = customerTabs[index][n % TABS];
			const id = randomUUID();
			const first = !consented.has(index);
			consented.add(index);

			const t0 = performance.now();
			sentAt.set(id, t0);
			pending.set(id, STAFF + TABS);
			inflight.push(
				(
					tab.timeout(10_000).emitWithAck("message:send", {
						clientMessageId: randomUUID(),
						body: `load:${id} сообщение ${n}`,
						attachmentIds: [],
						...(first ? { consent: { document: CONSENT_SLUG } } : {}),
					}) as Promise<AckResult<unknown>>
				)
					.then((result) => {
						ack.push(performance.now() - t0);
						if (!result.ok) {
							pending.delete(id);
							errors.set(
								result.error.code,
								(errors.get(result.error.code) ?? 0) + 1,
							);
						}
					})
					.catch(() => {
						pending.delete(id);
						errors.set("timeout", (errors.get("timeout") ?? 0) + 1);
					}),
			);

			if (n % (RATE * 10) === 0) {
				const h = await health();
				if ((h.rssMb ?? 0) > (peak.rssMb ?? 0)) peak = h;
			}
			const due = started + (n + 1) * interval;
			const wait = due - performance.now();
			if (wait > 0) await sleep(wait);
		}

		await Promise.all(inflight);
		const elapsed = (performance.now() - started) / 1_000;
		// Хвост доставки: даём последним событиям дойти.
		const deadline = performance.now() + 5_000;
		while (pending.size > 0 && performance.now() < deadline) await sleep(100);

		for (const socket of sockets) socket.disconnect();
		await sleep(1_000);
		const afterHealth = await health();

		const lost = [...pending.values()].reduce((a, b) => a + b, 0);
		const p95 = percentile(delivery, 95);
		const report = {
			сокетов: peakBefore.connections,
			сообщений: total,
			фактическийТемп: Math.round((total / elapsed) * 10) / 10,
			ошибки: Object.fromEntries(errors),
			доставок: delivery.length,
			потеряно: lost,
			ack: {
				p50: Math.round(percentile(ack, 50)),
				p95: Math.round(percentile(ack, 95)),
				max: Math.round(Math.max(...ack)),
			},
			доставка: {
				p50: Math.round(percentile(delivery, 50)),
				p95: Math.round(p95),
				p99: Math.round(percentile(delivery, 99)),
				max: Math.round(Math.max(...delivery)),
			},
			памятьШлюзаМб: {
				до: before.rssMb,
				пик: peak.rssMb,
				после: afterHealth.rssMb,
			},
		};
		console.log(JSON.stringify(report, null, 2));

		if (!(p95 < P95_LIMIT_MS)) {
			console.error(
				`✗ доставка p95 ${Math.round(p95)} мс ≥ ${P95_LIMIT_MS} мс`,
			);
			failed = true;
		}
		if (lost > 0 || errors.size > 0) {
			console.error(`✗ потеряно доставок: ${lost}, ошибок: ${errors.size}`);
			failed = true;
		}
		if (!failed) console.log("✓ порог выдержан");
	} finally {
		for (const socket of sockets) socket.disconnect();
		if (fixture) await teardownFixture(fixture);
	}
	process.exit(failed ? 1 : 0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
