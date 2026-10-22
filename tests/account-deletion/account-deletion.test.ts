/**
 * Удаление аккаунта: заявка → задача BullMQ → исполнение воркером.
 *
 *   pnpm test:account-deletion
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОВЕРЯЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Заявка аккаунта без пароля (подтверждена кодом) ставит отложенную
 *     задачу в очередь и остаётся pending — раньше BullMQ отвергал jobId с
 *     двоеточием, и заявка уходила в failed / QUEUE_SCHEDULING_FAILED.
 *  2. Отмена снимает задачу из очереди.
 *  3. Срок вышел → воркер исполняет задачу: пользователя нет, заявка
 *     completed и отвязана от аккаунта.
 *
 * Как и test:restock, набор ходит в настоящие Postgres и Redis и поэтому
 * исключён из `pnpm test`.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { sql } from "@payloadcms/db-postgres";
import { type Job, Queue, Worker } from "bullmq";
import { getPayload } from "payload";
import config from "../../payload.config.ts";
import {
	ACCOUNT_DELETION_JOB_NAME,
	ACCOUNT_DELETION_QUEUE,
} from "../../src/modules/account-deletion/lib/constants.ts";
import {
	type AccountDeletionJob,
	accountDeletionJobId,
	closeAccountDeletionQueue,
} from "../../src/modules/account-deletion/lib/queue.ts";
import { AccountDeletionService } from "../../src/modules/account-deletion/lib/service.ts";
import { redisConfig } from "../../src/modules/auth/lib/redis-config.ts";

const TAG = "account-deletion-test";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Payload = Awaited<ReturnType<typeof getPayload>>;

let payload: Payload;
let service: AccountDeletionService;
let queue: Queue<AccountDeletionJob>;
const userIds: number[] = [];
const requestIds: number[] = [];

/** Аккаунт как после регистрации через Яндекс ID: пароля никто не знает. */
async function makePasswordlessUser(key: string) {
	const email = `${TAG}-${RUN}-${key}@example.test`;
	const user = await payload.create({
		collection: "users",
		data: {
			email,
			password: `${TAG}-${RUN}-random-Password-1`,
			name: `Тест ${key}`,
			role: "user",
			status: "active",
			hasPassword: false,
		},
		overrideAccess: true,
	});
	userIds.push(Number(user.id));
	return { id: Number(user.id), email };
}

async function requestRow(requestId: number) {
	const result = (await payload.db.drizzle.execute(sql`
		SELECT status, last_error_code, user_id FROM account_deletion_requests
		WHERE id = ${requestId}
	`)) as {
		rows: {
			status: string;
			last_error_code: string | null;
			user_id: number | null;
		}[];
	};
	return result.rows[0];
}

before(async () => {
	payload = await getPayload({ config });
	service = new AccountDeletionService(payload);
	queue = new Queue(ACCOUNT_DELETION_QUEUE, { connection: redisConfig });
});

after(async () => {
	for (const requestId of requestIds) {
		await (await queue.getJob(accountDeletionJobId(requestId)))?.remove();
		await payload.db.drizzle.execute(
			sql`DELETE FROM account_deletion_requests WHERE id = ${requestId}`,
		);
	}
	await queue.close();
	await closeAccountDeletionQueue();
	for (const id of userIds) {
		try {
			await payload.delete({ collection: "users", id, overrideAccess: true });
		} catch {
			// Уже удалён тестом — так и задумано.
		}
	}
});

test("id задачи без двоеточия и один на заявку", () => {
	assert.equal(accountDeletionJobId(42), "account-deletion-42");
	assert.ok(!accountDeletionJobId(42).includes(":"));
});

test("заявка без пароля ставит отложенную задачу; отмена её снимает", async () => {
	const user = await makePasswordlessUser("cancel");
	const view = await service.requestDeletion({
		userId: user.id,
		email: user.email,
		confirmedByCode: true,
	});
	requestIds.push(Number(view.id));

	assert.equal(view.status, "pending");
	const row = await requestRow(Number(view.id));
	assert.equal(row.status, "pending");
	assert.equal(row.last_error_code, null);

	const job = await queue.getJob(accountDeletionJobId(Number(view.id)));
	assert.ok(job, "задача должна стоять в очереди");
	assert.equal(job.name, ACCOUNT_DELETION_JOB_NAME);
	assert.deepEqual(job.data, { requestId: Number(view.id) });
	assert.equal(await job.getState(), "delayed");

	await service.cancelDeletion(user.id, Number(view.id));
	assert.equal((await requestRow(Number(view.id))).status, "cancelled");
	assert.equal(
		await queue.getJob(accountDeletionJobId(Number(view.id))),
		undefined,
	);
});

test("срок вышел → воркер удаляет аккаунт", async () => {
	const user = await makePasswordlessUser("execute");
	const view = await service.requestDeletion({
		userId: user.id,
		email: user.email,
		confirmedByCode: true,
	});
	requestIds.push(Number(view.id));

	// Обращение связано с аккаунтом только почтой (у feedbacks нет user_id);
	// чужое с другой почтой должно уцелеть.
	const feedback = (id: string, email: string) =>
		payload.create({
			collection: "feedbacks",
			data: {
				type: "question",
				title: `${TAG} ${id}`,
				description: `${TAG} обращение для проверки удаления аккаунта`,
				userEmail: email,
			},
			overrideAccess: true,
		});
	const own = await feedback("own", user.email.toUpperCase());
	const foreign = await feedback("foreign", `${TAG}-${RUN}-other@example.test`);
	await payload.create({
		collection: "user-identities",
		data: {
			user: user.id,
			provider: "yandex",
			subject: `${TAG}-${RUN}`,
			emailAtLink: user.email,
		},
		overrideAccess: true,
	});

	// Перематываем 14 дней: срок в БД — в прошлое, задачу — на исполнение.
	await payload.db.drizzle.execute(sql`
		UPDATE account_deletion_requests SET scheduled_for = NOW() - INTERVAL '1 minute'
		WHERE id = ${Number(view.id)}
	`);
	const job = (await queue.getJob(
		accountDeletionJobId(Number(view.id)),
	)) as Job<AccountDeletionJob>;
	assert.ok(job);

	// Тот же обработчик, что в worker.ts (сам модуль воркера запускается на
	// импорте и поэтому не импортируется).
	const worker = new Worker<AccountDeletionJob>(
		ACCOUNT_DELETION_QUEUE,
		async (current) => {
			if (current.name !== ACCOUNT_DELETION_JOB_NAME) return;
			await service.executeDeletion(current.data.requestId);
		},
		{ connection: redisConfig },
	);
	// У задачи 8 попыток: упавшая уходит в delayed, а не в failed, поэтому
	// ждём первого исхода самого воркера — иначе ошибка видна только тайм-аутом.
	const outcome = new Promise<void>((resolve, reject) => {
		worker.on("completed", (done) => {
			if (done.id === job.id) resolve();
		});
		worker.on("failed", (failed, error) => {
			if (failed?.id === job.id) reject(error);
		});
	});
	try {
		await job.promote();
		await outcome;
	} finally {
		await worker.close();
	}

	const row = await requestRow(Number(view.id));
	assert.equal(row.status, "completed");
	assert.equal(row.user_id, null);
	const left = await payload.find({
		collection: "users",
		where: { id: { equals: user.id } },
		overrideAccess: true,
		depth: 0,
	});
	assert.equal(left.totalDocs, 0);

	const feedbacks = (await payload.db.drizzle.execute(sql`
		SELECT id FROM feedbacks WHERE id IN (${own.id}, ${foreign.id})
	`)) as { rows: { id: number }[] };
	assert.deepEqual(
		feedbacks.rows.map((r) => Number(r.id)),
		[Number(foreign.id)],
	);
	await payload.delete({
		collection: "feedbacks",
		id: foreign.id,
		overrideAccess: true,
	});
	const identities = (await payload.db.drizzle.execute(sql`
		SELECT count(*)::int AS n FROM user_identities WHERE subject = ${`${TAG}-${RUN}`}
	`)) as { rows: { n: number }[] };
	assert.equal(identities.rows[0].n, 0);
});
