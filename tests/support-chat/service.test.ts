/**
 * Чат поддержки: сервисный слой на настоящих Postgres и Redis.
 *
 *   pnpm test:support-chat
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОВЕРЯЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Первый диалог требует согласия; согласие сохраняется с версией.
 *  2. Повтор отправки с тем же clientMessageId — одно сообщение.
 *  3. 40 параллельных отправок — номера 1..40 без дыр и повторов.
 *  4. Две вкладки начинают переписку одновременно — один открытый диалог.
 *  5. Два менеджера жмут «Взять» одновременно — ровно один победитель.
 *  6. Заметка не доходит до покупателя: ни событием, ни через сервис, ни
 *     через REST Payload.
 *  7. Чужое вложение прикрепить нельзя.
 *  8. Автораспределение — менеджеру на месте; без менеджеров — очередь.
 *  9. Закрытие, переоткрытие сообщением покупателя, оценка — один раз.
 * 10. Подсказка заготовки по триггеру с другой словоформой.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { sql } from "@payloadcms/db-postgres";
import sharp from "sharp";
import {
	attachmentsDir,
	readAttachment,
	storeAttachment,
} from "../../src/modules/support-chat/server/attachments.ts";
import type { SupportError } from "../../src/modules/support-chat/server/errors.ts";
import { touchPresence } from "../../src/modules/support-chat/server/presence.ts";
import * as service from "../../src/modules/support-chat/server/support.service.ts";
import {
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

function send(body: string, extra: Record<string, unknown> = {}) {
	return {
		clientMessageId: randomUUID(),
		body,
		attachmentIds: [] as number[],
		...extra,
	};
}

async function rejectsWith(
	promise: Promise<unknown>,
	code: SupportError["code"],
) {
	await assert.rejects(promise, (error: SupportError) => {
		assert.equal(error.code, code, error.message);
		return true;
	});
}

describe("сообщения покупателя", () => {
	test("первое сообщение без согласия — consent_required; с согласием — диалог с версией документа", async () => {
		const customer = await makeCustomer(fixture, "consent");
		const d = deps(fixture, recordingBroadcaster());

		await rejectsWith(
			service.sendCustomerMessage(d, customer, send("Здравствуйте")),
			"consent_required",
		);
		await rejectsWith(
			service.sendCustomerMessage(
				d,
				customer,
				send("Здравствуйте", { consent: { document: "нет-такого" } }),
			),
			"invalid",
		);

		// Действующий, но другой документ (например, о cookie) — не согласие
		// на обработку переписки.
		const otherSlug = `support-chat-other-${Date.now().toString(36)}`;
		await fixture.payload.db.drizzle.execute(sql`
			INSERT INTO consents (title, slug, content, needs_acceptance, is_active, version)
			VALUES ('Другой документ', ${otherSlug}, 'Текст', TRUE, TRUE, '1.0.0')
		`);
		try {
			await rejectsWith(
				service.sendCustomerMessage(
					d,
					customer,
					send("Здравствуйте", { consent: { document: otherSlug } }),
				),
				"invalid",
			);
		} finally {
			await fixture.payload.db.drizzle.execute(
				sql`DELETE FROM consents WHERE slug = ${otherSlug}`,
			);
		}

		const result = await service.sendCustomerMessage(
			d,
			customer,
			send("Здравствуйте", { consent }),
		);
		assert.equal(result.message.seq, 1);

		const row = await fixture.payload.db.drizzle.execute(sql`
			SELECT consent_document, consent_accepted_at FROM support_conversations
			WHERE id = ${result.conversation.id}
		`);
		const stored = (row as { rows: Record<string, unknown>[] }).rows[0];
		const current = (await fixture.payload.db.drizzle.execute(
			sql`SELECT version FROM consents WHERE slug = ${CONSENT_SLUG}`,
		)) as { rows: { version: string | null }[] };
		assert.equal(
			stored.consent_document,
			`${CONSENT_SLUG}@${current.rows[0].version ?? "1.0.0"}`,
		);
		assert.ok(stored.consent_accepted_at);
	});

	test("повтор с тем же clientMessageId не создаёт второе сообщение и не рассылает событие", async () => {
		const customer = await makeCustomer(fixture, "dup");
		const broadcaster = recordingBroadcaster();
		const d = deps(fixture, broadcaster);
		const input = send("Один раз", { consent });

		const first = await service.sendCustomerMessage(d, customer, input);
		const eventsAfterFirst = broadcaster.events.length;
		const second = await service.sendCustomerMessage(d, customer, input);

		assert.equal(second.duplicate, true);
		assert.equal(second.message.id, first.message.id);
		assert.equal(broadcaster.events.length, eventsAfterFirst);
	});

	test("40 параллельных отправок — номера подряд без повторов", async () => {
		const customer = await makeCustomer(fixture, "burst");
		const d = deps(fixture, recordingBroadcaster());
		await service.sendCustomerMessage(d, customer, send("Начало", { consent }));

		const results = await Promise.all(
			Array.from({ length: 40 }, (_, i) =>
				service.sendCustomerMessage(d, customer, send(`№${i}`)),
			),
		);
		const seqs = results.map((r) => r.message.seq).sort((a, b) => a - b);
		// Подряд и без повторов. Начало не фиксируется: если в базе есть
		// менеджер «на месте» (живая консоль в dev), первое сообщение получает
		// ещё системное «Вам ответит…», и нумерация сдвигается на единицу.
		assert.equal(new Set(seqs).size, 40);
		assert.deepEqual(
			seqs,
			Array.from({ length: 40 }, (_, i) => seqs[0] + i),
		);
		assert.equal(new Set(results.map((r) => r.conversation.id)).size, 1);
	});

	test("две вкладки начинают переписку одновременно — один открытый диалог", async () => {
		const customer = await makeCustomer(fixture, "tabs");
		const d = deps(fixture, recordingBroadcaster());

		const results = await Promise.all(
			Array.from({ length: 6 }, (_, i) =>
				service.sendCustomerMessage(
					d,
					customer,
					send(`Вкладка ${i}`, { consent }),
				),
			),
		);
		assert.equal(new Set(results.map((r) => r.conversation.id)).size, 1);

		const open = await fixture.payload.db.drizzle.execute(sql`
			SELECT count(*)::int AS n FROM support_conversations
			WHERE user_id = ${customer.userId} AND status = 'open'
		`);
		assert.equal((open as unknown as { rows: { n: number }[] }).rows[0].n, 1);
	});
});

describe("персонал", () => {
	test("два менеджера жмут «Взять» одновременно — ровно один получает диалог", async () => {
		await setSettings(fixture, { routingMode: "manual" });
		try {
			const customer = await makeCustomer(fixture, "claim");
			const anna = await makeAgent(fixture, "Анна");
			const ivan = await makeAgent(fixture, "Иван");
			const d = deps(fixture, recordingBroadcaster());
			const { conversation } = await service.sendCustomerMessage(
				d,
				customer,
				send("Кто ответит?", { consent }),
			);

			const outcomes = await Promise.allSettled([
				service.claimForStaff(d, anna, conversation.id),
				service.claimForStaff(d, ivan, conversation.id),
			]);
			const won = outcomes.filter((o) => o.status === "fulfilled");
			const lost = outcomes.filter((o) => o.status === "rejected");
			assert.equal(won.length, 1);
			assert.equal(lost.length, 1);
			assert.equal(
				((lost[0] as PromiseRejectedResult).reason as SupportError).code,
				"conflict",
			);

			// Покупатель видит одно объявление — от победителя.
			const page = await service.openCustomerConversation(d, customer);
			const announcements = page.messages.filter(
				(m) => m.kind === "system" && /Вам ответит/.test(m.body),
			);
			assert.equal(announcements.length, 1);
		} finally {
			await setSettings(fixture, { routingMode: "auto" });
		}
	});

	test("заметка не доходит до покупателя ни одним путём", async () => {
		const customer = await makeCustomer(fixture, "note");
		const anna = await makeAgent(fixture, "Анна-заметки");
		const broadcaster = recordingBroadcaster();
		const d = deps(fixture, broadcaster);
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Вопрос", { consent }),
		);

		broadcaster.events.length = 0;
		await service.sendStaffMessage(d, anna, {
			conversationId: conversation.id,
			clientMessageId: randomUUID(),
			body: "Внутреннее: клиент из тендера",
			kind: "note",
			attachmentIds: [],
			documentIds: [],
		});
		await service.sendStaffMessage(d, anna, {
			conversationId: conversation.id,
			clientMessageId: randomUUID(),
			body: "Здравствуйте! Сейчас уточню.",
			kind: "text",
			attachmentIds: [],
			documentIds: [],
		});

		// События: заметка — только staff; ответ — и покупателю.
		const toCustomer = broadcaster.events.filter(
			(e) => e.room === `user:${customer.userId}`,
		);
		const customerBodies = toCustomer
			.filter((e) => e.event === "message:new")
			.map((e) => (e.data as { body: string }).body);
		assert.deepEqual(customerBodies, ["Здравствуйте! Сейчас уточню."]);
		assert.ok(
			broadcaster.events.some(
				(e) =>
					e.room === "staff" && (e.data as { kind?: string }).kind === "note",
			),
		);

		// Сервис: синхронизация покупателя без заметки, менеджера — с ней.
		const forCustomer = await service.syncMessages(d, customer, {
			conversationId: conversation.id,
			afterSeq: 0,
		});
		assert.ok(forCustomer.messages.every((m) => m.kind !== "note"));
		const forStaff = await service.syncMessages(d, anna, {
			conversationId: conversation.id,
			afterSeq: 0,
		});
		assert.ok(forStaff.messages.some((m) => m.kind === "note"));

		// REST Payload с правами покупателя.
		const user = await fixture.payload.findByID({
			collection: "users",
			id: customer.userId,
			overrideAccess: true,
		});
		const viaPayload = await fixture.payload.find({
			collection: "support-messages",
			where: { conversation: { equals: conversation.id } },
			overrideAccess: false,
			user: { ...user, collection: "users" },
			depth: 0,
			limit: 100,
		});
		assert.ok(viaPayload.docs.length > 0);
		assert.ok(viaPayload.docs.every((doc) => doc.kind !== "note"));
	});

	test("чужой диалог для покупателя — not_found", async () => {
		const owner = await makeCustomer(fixture, "owner");
		const stranger = await makeCustomer(fixture, "stranger");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			owner,
			send("Мой вопрос", { consent }),
		);

		await rejectsWith(
			service.syncMessages(d, stranger, {
				conversationId: conversation.id,
				afterSeq: 0,
			}),
			"not_found",
		);
		await rejectsWith(
			service.markRead(d, stranger, {
				conversationId: conversation.id,
				seq: 1,
			}),
			"not_found",
		);
	});

	test("чужое вложение прикрепить нельзя — сообщение не сохраняется", async () => {
		const victim = await makeCustomer(fixture, "victim");
		const attacker = await makeCustomer(fixture, "attacker");
		const d = deps(fixture, recordingBroadcaster());

		const attachment = await storeAttachment(fixture.payload, {
			actor: victim,
			filename: "Доверенность.pdf",
			data: Buffer.from("%PDF-1.7\nтестовый документ\n%%EOF"),
		});

		await rejectsWith(
			service.sendCustomerMessage(
				d,
				attacker,
				send("Смотрите", { consent, attachmentIds: [attachment.id] }),
			),
			"invalid",
		);
		await rejectsWith(
			readAttachment(fixture.payload, attacker, attachment.id, "original"),
			"not_found",
		);

		const own = await service.sendCustomerMessage(
			d,
			victim,
			send("Мой файл", { consent, attachmentIds: [attachment.id] }),
		);
		assert.equal(own.message.attachments.length, 1);
		assert.equal(own.message.attachments[0].filename, "Доверенность.pdf");
		assert.equal(
			own.message.attachments[0].url,
			`/api/support/attachments/${attachment.id}`,
		);

		// Уже прикреплённое — повторно нельзя даже владельцу.
		await rejectsWith(
			service.sendCustomerMessage(
				d,
				victim,
				send("Ещё раз", { attachmentIds: [attachment.id] }),
			),
			"invalid",
		);
	});
});

describe("распределение и жизненный цикл", () => {
	test("менеджер на месте получает новый диалог; покупателю — кто ответит", async () => {
		const customer = await makeCustomer(fixture, "auto");
		const agent = await makeAgent(fixture, "Ольга");
		await touchPresence(fixture.redis, agent.adminId, { status: "available" });
		const broadcaster = recordingBroadcaster();
		const d = deps(fixture, broadcaster);

		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Нужна помощь", { consent }),
		);
		const staffView = await service.getForStaff(d, agent, conversation.id);
		// Назначен кто-то из менеджеров на месте (в общей базе могут быть и другие).
		assert.notEqual(staffView.conversation.assigneeId, null);
		assert.ok(
			broadcaster.events.some(
				(e) =>
					e.room === `user:${customer.userId}` &&
					e.event === "message:new" &&
					/Вам ответит менеджер/.test((e.data as { body: string }).body),
			),
		);
	});

	test("закрытие, переоткрытие сообщением, оценка — один раз", async () => {
		const customer = await makeCustomer(fixture, "life");
		const agent = await makeAgent(fixture, "Пётр");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Вопрос", { consent }),
		);

		await rejectsWith(
			service.submitCsat(d, customer, {
				conversationId: conversation.id,
				score: 5,
			}),
			"conflict",
		);
		await service.resolveForStaff(d, agent, conversation.id);
		await rejectsWith(
			service.resolveForStaff(d, agent, conversation.id),
			"conflict",
		);

		const rated = await service.submitCsat(d, customer, {
			conversationId: conversation.id,
			score: 4,
			comment: "Спасибо",
		});
		assert.equal(rated.csatScore, 4);
		await rejectsWith(
			service.submitCsat(d, customer, {
				conversationId: conversation.id,
				score: 1,
			}),
			"conflict",
		);

		// В пределах окна — тот же диалог, оценка сброшена.
		const next = await service.sendCustomerMessage(
			d,
			customer,
			send("Ещё вопрос"),
		);
		assert.equal(next.conversation.id, conversation.id);
		assert.equal(next.conversation.status, "open");
		assert.equal(next.conversation.csatScore, null);
	});

	test("ответ на закрытый диалог — conflict, заметка — можно", async () => {
		const customer = await makeCustomer(fixture, "closed");
		const agent = await makeAgent(fixture, "Нина");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Вопрос", { consent }),
		);
		await service.resolveForStaff(d, agent, conversation.id);

		const base = {
			conversationId: conversation.id,
			attachmentIds: [] as number[],
			documentIds: [] as number[],
		};
		await rejectsWith(
			service.sendStaffMessage(d, agent, {
				...base,
				clientMessageId: randomUUID(),
				body: "Ответ",
				kind: "text",
			}),
			"conflict",
		);
		const note = await service.sendStaffMessage(d, agent, {
			...base,
			clientMessageId: randomUUID(),
			body: "Заметка после закрытия",
			kind: "note",
		});
		assert.equal(note.message.kind, "note");
	});

	test("подсказка заготовки ловит другую словоформу триггера", async () => {
		const customer = await makeCustomer(fixture, "canned");
		const agent = await makeAgent(fixture, "Вера");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Вопрос", { consent }),
		);

		const created = await fixture.payload.create({
			collection: "support-canned-responses",
			data: {
				title: `Сертификаты ${agent.adminId}`,
				body: "Высылаем сертификаты соответствия.",
				triggers: [{ phrase: "сертификат" }],
				scope: "personal",
				owner: agent.adminId,
			},
			overrideAccess: true,
		});

		const suggestions = await service.suggestionsForStaff(d, agent, {
			conversationId: conversation.id,
			text: "Добрый день, а есть ли у вас сертификатЫ на сеткомёт?",
		});
		assert.ok(suggestions.some((s) => s.id === Number(created.id)));

		const none = await service.suggestionsForStaff(d, agent, {
			conversationId: conversation.id,
			text: "Когда доставка?",
		});
		assert.ok(none.every((s) => s.id !== Number(created.id)));
	});
});

describe("шифрование и вложения", () => {
	const rows = async <T>(query: ReturnType<typeof sql>) =>
		(await fixture.payload.db.drizzle.execute(query)) as unknown as {
			rows: T[];
		};

	test("в базе нет открытого текста: сообщения, контекст, комментарий к оценке", async () => {
		const customer = await makeCustomer(fixture, "atrest");
		const agent = await makeAgent(fixture, "Шифр");
		const d = deps(fixture, recordingBroadcaster());
		const secret = "Паспорт серии 4510 номер 123456";
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send(secret, {
				consent,
				context: {
					type: "order",
					id: 77,
					title: "ORD-2026-000077",
					url: "/orders/ORD-2026-000077",
				},
			}),
		);
		await service.resolveForStaff(d, agent, conversation.id);
		await service.submitCsat(d, customer, {
			conversationId: conversation.id,
			score: 5,
			comment: "Анна очень помогла с доверенностью",
		});

		const dump = await rows<Record<string, unknown>>(sql`
			SELECT m.body::text AS body, c.csat_comment::text AS csat, c.encryption_key::text AS k
			FROM support_messages m JOIN support_conversations c ON c.id = m.conversation_id
			WHERE c.id = ${conversation.id}
		`);
		const raw = JSON.stringify(dump.rows);
		for (const leak of ["Паспорт", "4510", "ORD-2026-000077", "доверенност"]) {
			assert.ok(!raw.includes(leak), `в базе открыто: ${leak}`);
		}
		assert.ok(dump.rows.every((row) => String(row.body).startsWith("e1.")));

		// Через сервис — читается.
		const page = await service.syncMessages(d, customer, {
			conversationId: conversation.id,
			afterSeq: 0,
		});
		const first = page.messages.find((m) => m.authorType === "customer");
		assert.equal(first?.body, secret);
		assert.equal(first?.context?.title, "ORD-2026-000077");
	});

	test("заметка с подменённым в базе kind не раскрывается покупателю", async () => {
		const customer = await makeCustomer(fixture, "tamper");
		const agent = await makeAgent(fixture, "Подмена");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Вопрос", { consent }),
		);
		const note = await service.sendStaffMessage(d, agent, {
			conversationId: conversation.id,
			clientMessageId: randomUUID(),
			body: "Клиент из чёрного списка",
			kind: "note",
			attachmentIds: [],
			documentIds: [],
		});

		// Атака на базу: сделать заметку видимой покупателю.
		await fixture.payload.db.drizzle.execute(
			sql`UPDATE support_messages SET kind = 'text' WHERE id = ${note.message.id}`,
		);
		const page = await service.syncMessages(d, customer, {
			conversationId: conversation.id,
			afterSeq: 0,
		});
		const tampered = page.messages.find((m) => m.id === note.message.id);
		assert.ok(tampered, "строка видна (kind подменён)…");
		assert.ok(
			!tampered.body.includes("чёрного"),
			"…но текст не расшифровывается",
		);
	});

	test("изображение: перекодировано, превью есть, на диске — только шифртекст", async () => {
		const customer = await makeCustomer(fixture, "image");
		const png = await sharp({
			create: {
				width: 3000,
				height: 1500,
				channels: 3,
				background: { r: 200, g: 30, b: 30 },
			},
		})
			.png()
			.toBuffer();

		const attachment = await storeAttachment(fixture.payload, {
			actor: customer,
			filename: "фото с объекта.PNG",
			data: png,
		});
		assert.equal(attachment.mimeType, "image/png");
		assert.equal(attachment.width, 2560, "сторона ограничена");
		assert.ok(attachment.thumbnailUrl);

		const stored = await rows<{ storage_key: string; encrypted_name: string }>(
			sql`SELECT storage_key, encrypted_name FROM support_attachments WHERE id = ${attachment.id}`,
		);
		const { storage_key: storageKey, encrypted_name: encryptedName } =
			stored.rows[0];
		assert.ok(!encryptedName.includes("фото"));
		const onDisk = await readFile(path.join(attachmentsDir(), storageKey));
		assert.ok(
			!onDisk.subarray(0, 64).includes(Buffer.from("PNG")),
			"сигнатура PNG не видна",
		);

		const original = await readAttachment(
			fixture.payload,
			customer,
			attachment.id,
			"original",
		);
		assert.equal(original.filename, "фото с объекта.png");
		const meta = await sharp(original.data).metadata();
		assert.equal(meta.width, 2560);
		const thumb = await readAttachment(
			fixture.payload,
			customer,
			attachment.id,
			"thumbnail",
		);
		assert.equal((await sharp(thumb.data).metadata()).format, "webp");
	});

	test("не тот тип и битая картинка — отказ", async () => {
		const customer = await makeCustomer(fixture, "badfile");
		await rejectsWith(
			storeAttachment(fixture.payload, {
				actor: customer,
				filename: "отчёт.pdf",
				data: Buffer.from("MZ\x90\x00 это exe"),
			}),
			"invalid",
		);
		await rejectsWith(
			storeAttachment(fixture.payload, {
				actor: customer,
				filename: "битое.jpg",
				data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]),
			}),
			"invalid",
		);
	});

	test("вложение заметки покупателю недоступно, вложение ответа — доступно", async () => {
		const customer = await makeCustomer(fixture, "staffatt");
		const agent = await makeAgent(fixture, "Файлы");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Пришлите", { consent }),
		);
		const pdf = () => Buffer.from("%PDF-1.7\nдокумент\n%%EOF");

		const forNote = await storeAttachment(fixture.payload, {
			actor: agent,
			filename: "внутр.pdf",
			data: pdf(),
		});
		const forReply = await storeAttachment(fixture.payload, {
			actor: agent,
			filename: "счёт.pdf",
			data: pdf(),
		});
		const base = {
			conversationId: conversation.id,
			documentIds: [] as number[],
		};
		await service.sendStaffMessage(d, agent, {
			...base,
			clientMessageId: randomUUID(),
			body: "",
			kind: "note",
			attachmentIds: [forNote.id],
		});
		await service.sendStaffMessage(d, agent, {
			...base,
			clientMessageId: randomUUID(),
			body: "Счёт во вложении",
			kind: "text",
			attachmentIds: [forReply.id],
		});

		await rejectsWith(
			readAttachment(fixture.payload, customer, forNote.id, "original"),
			"not_found",
		);
		const file = await readAttachment(
			fixture.payload,
			customer,
			forReply.id,
			"original",
		);
		assert.equal(file.filename, "счёт.pdf");
	});

	test("документ из медиатеки уходит покупателю ссылкой, несуществующий — отказ", async () => {
		const customer = await makeCustomer(fixture, "docs");
		const agent = await makeAgent(fixture, "Документы");
		const broadcaster = recordingBroadcaster();
		const d = deps(fixture, broadcaster);
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Сертификат?", { consent }),
		);

		const media = await rows<{ id: number }>(sql`
			INSERT INTO media (filename, mime_type, filesize, alt, updated_at, created_at)
			VALUES (${`cert-${randomUUID()}.pdf`}, 'application/pdf', 1000, 'Сертификат соответствия', now(), now())
			RETURNING id
		`);
		const mediaId = Number(media.rows[0].id);
		try {
			const base = {
				conversationId: conversation.id,
				clientMessageId: randomUUID(),
				body: "Высылаю сертификат",
				kind: "text" as const,
				attachmentIds: [] as number[],
			};
			await rejectsWith(
				service.sendStaffMessage(d, agent, {
					...base,
					documentIds: [2_000_000_000],
				}),
				"invalid",
			);
			await service.sendStaffMessage(d, agent, {
				...base,
				documentIds: [mediaId],
			});
			const toCustomer = broadcaster.events.find(
				(e) =>
					e.room === `user:${customer.userId}` &&
					e.event === "message:new" &&
					(e.data as { body: string }).body === "Высылаю сертификат",
			);
			const documents = (
				toCustomer?.data as {
					documents: { id: number; title: string; url: string }[];
				}
			).documents;
			assert.equal(documents[0].id, mediaId);
			assert.equal(documents[0].title, "Сертификат соответствия");
			assert.match(documents[0].url, /^\/api\/media\/file\//);
		} finally {
			await fixture.payload.db.drizzle.execute(
				sql`DELETE FROM media WHERE id = ${mediaId}`,
			);
		}
	});

	test("подсказки к сообщению покупателя приходят менеджерам сами", async () => {
		const customer = await makeCustomer(fixture, "autosuggest");
		const agent = await makeAgent(fixture, "Подсказки");
		const broadcaster = recordingBroadcaster();
		const d = deps(fixture, broadcaster);
		const trigger = `гарантийныйталон${agent.adminId}`;
		const canned = await fixture.payload.create({
			collection: "support-canned-responses",
			data: {
				title: "Гарантия",
				body: "Гарантия — 12 месяцев.",
				triggers: [{ phrase: trigger }],
				scope: "shared",
				owner: agent.adminId,
			},
			overrideAccess: true,
		});

		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send(`Где мой ${trigger}?`, { consent }),
		);
		const event = broadcaster.events.find(
			(e) => e.event === "suggestions:updated",
		);
		assert.equal(event?.room, "staff");
		const data = event?.data as {
			conversationId: number;
			suggestions: { id: number }[];
		};
		assert.equal(data.conversationId, conversation.id);
		assert.ok(data.suggestions.some((s) => s.id === Number(canned.id)));
	});

	test("счётчики: непрочитанные покупателя и сводка для меню", async () => {
		const customer = await makeCustomer(fixture, "counters");
		const agent = await makeAgent(fixture, "Счётчики");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Вопрос", { consent }),
		);
		const before = await service.customerUnreadCount(d, customer);

		await service.sendStaffMessage(d, agent, {
			conversationId: conversation.id,
			clientMessageId: randomUUID(),
			body: "Ответ",
			kind: "text",
			attachmentIds: [],
			documentIds: [],
		});
		assert.equal(await service.customerUnreadCount(d, customer), before + 1);

		const last = await service.syncMessages(d, customer, {
			conversationId: conversation.id,
			afterSeq: 0,
		});
		await service.markRead(d, customer, {
			conversationId: conversation.id,
			seq: Math.max(...last.messages.map((m) => m.seq)),
		});
		assert.equal(await service.customerUnreadCount(d, customer), 0);

		const summary = await service.staffSummary(d, agent);
		assert.ok(summary.awaiting >= 0 && summary.queue >= 0);
	});
});
