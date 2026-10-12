/**
 * Чат поддержки: обслуживание и ограничения — разделы 12–13, на настоящих
 * Postgres и Redis.
 *
 *   pnpm test:support-chat
 *
 *  1. Автозакрытие: последнее слово за менеджером + тишина дольше срока.
 *  2. Обезличивание при удалении аккаунта: ключ уничтожен, сообщения и
 *     вложения удалены, цифры для отчётов остались, писать туда нельзя.
 *  3. Срок хранения: переписка старше трёх лет обезличивается.
 *  4. Неотправленные вложения старше суток и файлы без записи убираются.
 *  5. Запрет писать в чат: отказ в отправке.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { sql } from "@payloadcms/db-postgres";
import { storeAttachment } from "../../src/modules/support-chat/server/attachments.ts";
import type { SupportError } from "../../src/modules/support-chat/server/errors.ts";
import {
	anonymizeExpired,
	anonymizeUserConversations,
	deleteStalePendingAttachments,
	purgeOrphanFiles,
} from "../../src/modules/support-chat/server/maintenance.ts";
import { attachmentsDir } from "../../src/modules/support-chat/server/storage-path.ts";
import * as service from "../../src/modules/support-chat/server/support.service.ts";
import {
	CONSENT_SLUG,
	deps,
	type Fixture,
	makeAgent,
	makeCustomer,
	recordingBroadcaster,
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

const db = () => fixture.payload.db.drizzle as never;
const rows = async <T>(query: ReturnType<typeof sql>) =>
	(
		(await fixture.payload.db.drizzle.execute(query)) as unknown as {
			rows: T[];
		}
	).rows;

const consent = { document: CONSENT_SLUG };
const send = (body: string, extra: Record<string, unknown> = {}) => ({
	clientMessageId: randomUUID(),
	body,
	attachmentIds: [] as number[],
	...extra,
});

async function rejectsWith(
	promise: Promise<unknown>,
	code: SupportError["code"],
) {
	await assert.rejects(promise, (error: SupportError) => {
		assert.equal(error.code, code, error.message);
		return true;
	});
}

describe("автозакрытие", () => {
	test("последнее слово за менеджером и тишина дольше срока — закрыт с сообщением", async () => {
		const customer = await makeCustomer(fixture, "stale");
		const agent = await makeAgent(fixture, "Закрывающая");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Вопрос", { consent }),
		);
		await service.sendStaffMessage(d, agent, {
			conversationId: conversation.id,
			clientMessageId: randomUUID(),
			body: "Ответ",
			kind: "text",
			attachmentIds: [],
			documentIds: [],
		});
		await fixture.payload.db.drizzle.execute(sql`
			UPDATE support_conversations
			SET last_staff_message_at = now() - interval '10 days'
			WHERE id = ${conversation.id}
		`);

		const result = await service.runMaintenance(d);
		assert.ok(result.autoClosed >= 1);
		const view = await service.getForStaff(d, agent, conversation.id);
		assert.equal(view.conversation.status, "resolved");
		assert.ok(
			view.messages.some(
				(m) => m.kind === "system" && /закрыт автоматически/.test(m.body),
			),
		);
	});

	test("покупатель ждёт ответа — не закрывается, сколько бы ни прошло", async () => {
		const customer = await makeCustomer(fixture, "waiting");
		const d = deps(fixture, recordingBroadcaster());
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Ответьте", { consent }),
		);
		await fixture.payload.db.drizzle.execute(sql`
			UPDATE support_conversations
			SET last_staff_message_at = now() - interval '30 days'
			WHERE id = ${conversation.id}
		`);
		await service.runMaintenance(d);
		const [row] = await rows<{ status: string }>(
			sql`SELECT status FROM support_conversations WHERE id = ${conversation.id}`,
		);
		assert.equal(row.status, "open");
	});
});

describe("обезличивание", () => {
	test("удаление аккаунта: ключ уничтожен, переписка и вложения удалены, цифры остались", async () => {
		const customer = await makeCustomer(fixture, "deleted");
		const agent = await makeAgent(fixture, "Удаление");
		const d = deps(fixture, recordingBroadcaster());
		const file = await storeAttachment(fixture.payload, {
			actor: customer,
			filename: "паспорт.pdf",
			data: Buffer.from("%PDF-1.7\nперсональные данные\n%%EOF"),
		});
		const { conversation } = await service.sendCustomerMessage(
			d,
			customer,
			send("Мой паспорт во вложении", { consent, attachmentIds: [file.id] }),
		);
		await service.resolveForStaff(d, agent, conversation.id);
		await service.submitCsat(d, customer, {
			conversationId: conversation.id,
			score: 5,
			comment: "Спасибо",
		});

		await fixture.payload.db.drizzle.transaction((tx) =>
			anonymizeUserConversations(tx as never, customer.userId),
		);

		const [row] = await rows<Record<string, unknown>>(
			sql`SELECT * FROM support_conversations WHERE id = ${conversation.id}`,
		);
		assert.equal(row.user_id, null);
		assert.equal(row.encryption_key, "");
		assert.equal(row.csat_comment, null);
		assert.equal(row.consent_document, null);
		assert.equal(Number(row.csat_score), 5, "оценка для отчётов осталась");
		assert.ok(
			row.first_response_at || row.resolved_at,
			"время для отчётов осталось",
		);

		const messages = await rows(
			sql`SELECT 1 FROM support_messages WHERE conversation_id = ${conversation.id}`,
		);
		const files = await rows(
			sql`SELECT 1 FROM support_attachments WHERE id = ${file.id}`,
		);
		assert.equal(messages.length, 0);
		assert.equal(files.length, 0);

		// Обезличенный диалог больше не принимает ничего — понятный отказ.
		await rejectsWith(
			service.sendStaffMessage(d, agent, {
				conversationId: conversation.id,
				clientMessageId: randomUUID(),
				body: "заметка",
				kind: "note",
				attachmentIds: [],
				documentIds: [],
			}),
			"conflict",
		);
		await fixture.payload.db.drizzle.execute(
			sql`DELETE FROM support_conversations WHERE id = ${conversation.id}`,
		);
	});

	test("срок хранения: переписка старше трёх лет обезличивается, свежая — нет", async () => {
		const old = await makeCustomer(fixture, "ancient");
		const fresh = await makeCustomer(fixture, "fresh");
		const d = deps(fixture, recordingBroadcaster());
		const a = await service.sendCustomerMessage(
			d,
			old,
			send("Давно", { consent }),
		);
		const b = await service.sendCustomerMessage(
			d,
			fresh,
			send("Сейчас", { consent }),
		);
		await fixture.payload.db.drizzle.execute(sql`
			UPDATE support_conversations
			SET last_message_at = now() - interval '3 years 1 day',
				created_at = now() - interval '3 years 2 days'
			WHERE id = ${a.conversation.id}
		`);

		const count = await anonymizeExpired(db());
		assert.ok(count >= 1);
		const keys = await rows<{ id: number; encryption_key: string }>(sql`
			SELECT id, encryption_key FROM support_conversations
			WHERE id IN (${a.conversation.id}, ${b.conversation.id})
		`);
		const byId = new Map(keys.map((k) => [Number(k.id), k.encryption_key]));
		assert.equal(byId.get(a.conversation.id), "");
		assert.notEqual(byId.get(b.conversation.id), "");
		await fixture.payload.db.drizzle.execute(
			sql`DELETE FROM support_conversations WHERE id = ${a.conversation.id}`,
		);
	});
});

describe("уборка вложений", () => {
	test("неотправленное старше суток удаляется, свежее — остаётся", async () => {
		const customer = await makeCustomer(fixture, "pending");
		const pdf = () => Buffer.from("%PDF-1.7\nчерновик\n%%EOF");
		const stale = await storeAttachment(fixture.payload, {
			actor: customer,
			filename: "старый.pdf",
			data: pdf(),
		});
		const recent = await storeAttachment(fixture.payload, {
			actor: customer,
			filename: "новый.pdf",
			data: pdf(),
		});
		await fixture.payload.db.drizzle.execute(sql`
			UPDATE support_attachments SET created_at = now() - interval '2 days' WHERE id = ${stale.id}
		`);

		assert.ok((await deleteStalePendingAttachments(db())) >= 1);
		const left = await rows<{ id: number }>(sql`
			SELECT id FROM support_attachments WHERE id IN (${stale.id}, ${recent.id})
		`);
		assert.deepEqual(
			left.map((r) => Number(r.id)),
			[recent.id],
		);
	});

	test("файл без записи старше часа удаляется; свежий и известный — нет", async () => {
		const dir = attachmentsDir();
		await mkdir(dir, { recursive: true });
		const orphan = path.join(dir, randomUUID());
		const young = path.join(dir, randomUUID());
		await writeFile(orphan, "шифртекст");
		await writeFile(young, "шифртекст");
		const hourAgo = new Date(Date.now() - 2 * 60 * 60_000);
		await utimes(orphan, hourAgo, hourAgo);

		const customer = await makeCustomer(fixture, "known");
		const known = await storeAttachment(fixture.payload, {
			actor: customer,
			filename: "нужный.pdf",
			data: Buffer.from("%PDF-1.7\n%%EOF"),
		});
		const [{ storage_key: knownKey }] = await rows<{ storage_key: string }>(
			sql`SELECT storage_key FROM support_attachments WHERE id = ${known.id}`,
		);
		await utimes(path.join(dir, knownKey), hourAgo, hourAgo);

		await purgeOrphanFiles(db());
		await assert.rejects(stat(orphan), "сирота удалена");
		await stat(young); // моложе часа — может быть идущей загрузкой
		await stat(path.join(dir, knownKey)); // запись есть — файл нужен
		await purgeOrphanFiles(db()).catch(() => {});
		await import("node:fs/promises").then((fs) =>
			fs.unlink(young).catch(() => {}),
		);
	});
});

describe("запрет писать в чат", () => {
	test("покупателю с запретом отправка отклоняется", async () => {
		const customer = await makeCustomer(fixture, "banned");
		const d = deps(fixture, recordingBroadcaster());
		await rejectsWith(
			service.sendCustomerMessage(
				d,
				{ ...customer, chatBanned: true },
				send("Спам", { consent }),
			),
			"forbidden",
		);
	});
});
