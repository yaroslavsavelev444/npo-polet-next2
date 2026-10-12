/**
 * Чат поддержки: Socket.IO-шлюз целиком — настоящие сокеты, сессии Payload,
 * redis-adapter.
 *
 *   pnpm test:support-chat
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОВЕРЯЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Без сессии, с чужим Origin, заблокированный покупатель — отказ в
 *     рукопожатии.
 *  2. Переписка в обе стороны: покупатель → менеджер, ответ → покупателю.
 *  3. Заметка менеджера до сокета покупателя не доходит.
 *  4. «Печатает» доходит до другой стороны.
 *  5. Неверные данные — ack с invalid, соединение живо.
 *  6. Событие из другого процесса (redis-emitter) доходит до сокета.
 *  7. После разрыва `sync` догружает пропущенное.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import Redis from "ioredis";
import { io as connect, type Socket } from "socket.io-client";
import { revokeAllPayloadSessions } from "../../src/modules/auth/lib/payloadSessions.ts";
import { redisConfig } from "../../src/modules/auth/lib/redis-config.ts";
import type { AckResult } from "../../src/modules/support-chat/lib/events.ts";
import {
	closeRedisBroadcaster,
	getRedisBroadcaster,
	rooms,
} from "../../src/modules/support-chat/server/broadcast.ts";
import {
	createSupportGateway,
	SOCKET_PATH,
	type SupportGateway,
} from "../../src/modules/support-chat/server/gateway/server.ts";
import {
	CONSENT_SLUG,
	type Fixture,
	makeAgent,
	makeCustomer,
	sessionCookie,
	setupFixture,
	teardownFixture,
} from "./helpers.ts";

const ORIGIN = "http://localhost:3000";

let fixture: Fixture;
let httpServer: HttpServer;
let gateway: SupportGateway;
let pub: Redis;
let sub: Redis;
let url: string;
const sockets: Socket[] = [];

before(async () => {
	fixture = await setupFixture();
	pub = new Redis(redisConfig);
	sub = pub.duplicate();
	httpServer = createServer();
	gateway = createSupportGateway({
		payload: fixture.payload,
		redis: fixture.redis,
		httpServer,
		allowedOrigins: [ORIGIN],
		adapter: { pub, sub },
	});
	await new Promise<void>((resolve) =>
		httpServer.listen(0, "127.0.0.1", resolve),
	);
	url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

after(async () => {
	for (const socket of sockets) socket.disconnect();
	await gateway.close();
	await closeRedisBroadcaster();
	await Promise.allSettled([pub.quit(), sub.quit()]);
	await teardownFixture(fixture);
});

function open(headers: Record<string, string>): Socket {
	const socket = connect(url, {
		path: SOCKET_PATH,
		transports: ["websocket"],
		extraHeaders: headers,
		reconnection: false,
		forceNew: true,
	});
	sockets.push(socket);
	return socket;
}

function connected(socket: Socket): Promise<void> {
	return new Promise((resolve, reject) => {
		socket.once("connect", () => resolve());
		socket.once("connect_error", reject);
	});
}

function rejected(
	socket: Socket,
): Promise<Error & { data?: { code?: string } }> {
	return new Promise((resolve, reject) => {
		socket.once("connect", () =>
			reject(new Error("Подключение не должно было пройти")),
		);
		socket.once("connect_error", resolve);
	});
}

function request<T>(
	socket: Socket,
	event: string,
	data?: unknown,
): Promise<AckResult<T>> {
	return socket.timeout(5_000).emitWithAck(event, data) as Promise<
		AckResult<T>
	>;
}

function nextEvent<T>(
	socket: Socket,
	event: string,
	predicate: (data: T) => boolean = () => true,
	timeoutMs = 3_000,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off(event, handler);
			reject(new Error(`Не дождались ${event}`));
		}, timeoutMs);
		const handler = (data: T) => {
			if (!predicate(data)) return;
			clearTimeout(timer);
			socket.off(event, handler);
			resolve(data);
		};
		socket.on(event, handler);
	});
}

/** Убедиться, что событие НЕ пришло за отведённое время. */
async function silence(
	socket: Socket,
	event: string,
	predicate: (data: unknown) => boolean,
	ms = 500,
) {
	const received: unknown[] = [];
	const handler = (data: unknown) => {
		if (predicate(data)) received.push(data);
	};
	socket.on(event, handler);
	await new Promise((resolve) => setTimeout(resolve, ms));
	socket.off(event, handler);
	assert.deepEqual(received, []);
}

async function customerSocket(key: string) {
	const customer = await makeCustomer(fixture, key);
	const cookie = await sessionCookie(fixture, "users", customer.email);
	const socket = open({ cookie, origin: ORIGIN });
	await connected(socket);
	return { customer, cookie, socket };
}

async function staffSocket(key: string) {
	const agent = await makeAgent(fixture, key);
	const cookie = await sessionCookie(fixture, "admins", agent.email);
	const socket = open({ cookie, origin: ORIGIN });
	await connected(socket);
	return { agent, socket };
}

interface SentMessage {
	message: { id: number; seq: number; conversationId: number; body: string };
	conversation: { id: number };
}

describe("рукопожатие", () => {
	test("без сессии — unauthorized", async () => {
		const error = await rejected(open({ origin: ORIGIN }));
		assert.equal(error.data?.code, "unauthorized");
	});

	test("чужой Origin — отказ даже с действующей сессией", async () => {
		const customer = await makeCustomer(fixture, "origin");
		const cookie = await sessionCookie(fixture, "users", customer.email);
		await rejected(open({ cookie, origin: "https://evil.example" }));
	});

	test("заблокированный покупатель — unauthorized", async () => {
		const customer = await makeCustomer(fixture, "blocked");
		const cookie = await sessionCookie(fixture, "users", customer.email);
		await fixture.payload.update({
			collection: "users",
			id: customer.userId,
			data: { status: "blocked" },
			overrideAccess: true,
		});
		const error = await rejected(open({ cookie, origin: ORIGIN }));
		assert.equal(error.data?.code, "unauthorized");
	});
});

describe("запрет и отзыв сессии", () => {
	test("покупателю с запретом писать — отказ в рукопожатии", async () => {
		const customer = await makeCustomer(fixture, "banned-socket");
		const cookie = await sessionCookie(fixture, "users", customer.email);
		await fixture.payload.update({
			collection: "users",
			id: customer.userId,
			data: { supportChatBanned: true },
			overrideAccess: true,
		});
		const error = await rejected(open({ cookie, origin: ORIGIN }));
		assert.equal(error.data?.code, "forbidden");
	});

	test("отзыв сессий рвёт открытый сокет сразу, переподключиться нельзя", async () => {
		const { customer, cookie, socket } = await customerSocket("revoked");
		const disconnected = new Promise<string>((resolve) =>
			socket.once("disconnect", resolve),
		);

		await revokeAllPayloadSessions(fixture.payload, customer.userId);
		assert.equal(await disconnected, "io server disconnect");

		const error = await rejected(open({ cookie, origin: ORIGIN }));
		assert.equal(error.data?.code, "unauthorized");
	});
});

describe("переписка", () => {
	test("покупатель ↔ менеджер, заметка не доходит, «печатает» доходит", async () => {
		const { socket: staff } = await staffSocket("Шлюз-Анна");
		const { customer, socket: client } = await customerSocket("talk");

		const opened = await request<{
			conversation: null;
			eta: { label: string };
		}>(client, "conversation:open");
		assert.equal(opened.ok, true);

		// Покупатель → менеджер.
		const staffSees = nextEvent<{ body: string; conversationId: number }>(
			staff,
			"message:new",
			(m) => m.body === "Добрый день",
		);
		const sent = await request<SentMessage>(client, "message:send", {
			clientMessageId: randomUUID(),
			body: "Добрый день",
			consent: { document: CONSENT_SLUG },
		});
		assert.equal(sent.ok, true, JSON.stringify(sent));
		const conversationId = (sent as { data: SentMessage }).data.conversation.id;
		assert.equal((await staffSees).conversationId, conversationId);

		// «Печатает» покупателя — менеджеру.
		const typing = nextEvent<{ side: string; conversationId: number }>(
			staff,
			"typing",
		);
		client.emit("typing", { conversationId, active: true });
		assert.equal((await typing).side, "customer");

		// Заметка — покупателю не приходит.
		const noteSilence = silence(
			client,
			"message:new",
			(m) => (m as { kind?: string }).kind === "note",
		);
		const note = await request(staff, "staff:message:send", {
			conversationId,
			clientMessageId: randomUUID(),
			body: "Внутреннее",
			kind: "note",
		});
		assert.equal(note.ok, true);
		await noteSilence;

		// Ответ — приходит, с именем менеджера для покупателей.
		const customerSees = nextEvent<{ body: string; author: { name: string } }>(
			client,
			"message:new",
			(m) => m.body === "Здравствуйте!",
		);
		const reply = await request(staff, "staff:message:send", {
			conversationId,
			clientMessageId: randomUUID(),
			body: "Здравствуйте!",
		});
		assert.equal(reply.ok, true);
		assert.equal((await customerSees).author.name, "Шлюз-Анна");

		// Неверные данные — ack invalid, соединение живо.
		const invalid = await request(client, "message:send", { body: "" });
		assert.equal(invalid.ok, false);
		assert.equal(
			(invalid as { error: { code: string } }).error.code,
			"invalid",
		);
		assert.equal(client.connected, true);

		// Событие из другого процесса через Redis доходит до сокета.
		const fromEmitter = nextEvent<{ marker: string }>(client, "test:ping");
		getRedisBroadcaster()
			.to(rooms.user(customer.userId))
			.emit("test:ping", { marker: "ok" });
		assert.equal((await fromEmitter).marker, "ok");
	});

	test("покупатель не попадает в чужой диалог: ни staff-событиями, ни sync", async () => {
		const { socket: staff } = await staffSocket("Шлюз-Чужой");
		const { socket: owner } = await customerSocket("owner");
		const { socket: intruder } = await customerSocket("intruder");

		const sent = (await request<SentMessage>(owner, "message:send", {
			clientMessageId: randomUUID(),
			body: "Мой вопрос",
			consent: { document: CONSENT_SLUG },
		})) as { ok: true; data: SentMessage };
		const conversationId = sent.data.conversation.id;

		// Событий персонала у покупателя нет вовсе — ответа не будет.
		await assert.rejects(
			intruder.timeout(500).emitWithAck("staff:join", { conversationId }),
			"staff:join покупателю не отвечает",
		);
		const synced = await request(intruder, "sync", {
			conversationId,
			afterSeq: 0,
		});
		assert.equal(synced.ok, false);
		assert.equal(
			(synced as { ok: false; error: { code: string } }).error.code,
			"not_found",
		);

		// Ответ менеджера в этом диалоге до чужого сокета не доходит.
		const quiet = silence(
			intruder,
			"message:new",
			(m) =>
				(m as { conversationId?: number }).conversationId === conversationId,
		);
		await request(staff, "staff:message:send", {
			conversationId,
			clientMessageId: randomUUID(),
			body: "Ответ владельцу",
		});
		await quiet;
	});

	test("после разрыва sync догружает пропущенное", async () => {
		const { socket: staff } = await staffSocket("Шлюз-Иван");
		const { cookie, socket: client } = await customerSocket("resync");

		const first = (await request<SentMessage>(client, "message:send", {
			clientMessageId: randomUUID(),
			body: "До разрыва",
			consent: { document: CONSENT_SLUG },
		})) as { ok: true; data: SentMessage };
		const { conversation, message } = first.data;
		client.disconnect();

		for (const body of ["Пока вас не было — 1", "Пока вас не было — 2"]) {
			const sent = await request(staff, "staff:message:send", {
				conversationId: conversation.id,
				clientMessageId: randomUUID(),
				body,
			});
			assert.equal(sent.ok, true);
		}

		const again = open({ cookie, origin: ORIGIN });
		await connected(again);
		const synced = (await request<{ messages: { body: string }[] }>(
			again,
			"sync",
			{
				conversationId: conversation.id,
				afterSeq: message.seq,
			},
		)) as { ok: true; data: { messages: { body: string }[] } };
		const bodies = synced.data.messages.map((m) => m.body);
		assert.ok(bodies.includes("Пока вас не было — 1"));
		assert.ok(bodies.includes("Пока вас не было — 2"));
	});
});
