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
	anonymizeOrdersOfUser,
	countAnonymizedOrdersWithLeftovers,
	ORDER_PERSONAL_COLUMNS,
	scrubAnonymizedOrders,
} from "../../src/modules/account-deletion/lib/order-anonymization.ts";
import {
	type AccountDeletionJob,
	accountDeletionJobId,
	closeAccountDeletionQueue,
} from "../../src/modules/account-deletion/lib/queue.ts";
import { AccountDeletionService } from "../../src/modules/account-deletion/lib/service.ts";
import { redisConfig } from "../../src/modules/auth/lib/redis-config.ts";
import {
	drizzleOf,
	type Executor,
	query,
	queryOne,
} from "../../src/modules/support-chat/server/db.ts";

const TAG = "account-deletion-test";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Payload = Awaited<ReturnType<typeof getPayload>>;

let payload: Payload;
let service: AccountDeletionService;
let queue: Queue<AccountDeletionJob>;
const userIds: number[] = [];
const requestIds: number[] = [];
const orderIds: number[] = [];

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
	// Заказ убирается здесь, а не в конце теста: упавший прогон не должен оставлять
	// в базе заказ, который потом посчитает скрипт дочистки.
	for (const orderId of orderIds) {
		await payload.db.drizzle.execute(
			sql`DELETE FROM orders WHERE id = ${orderId}`,
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

	// Заказ должен пережить удаление, но уже без адреса и данных покупателя.
	const orderId = await insertFullOrder(drizzleOf(payload), {
		key: "execute",
		userId: user.id,
	});
	orderIds.push(orderId);

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

	const db = drizzleOf(payload);
	const order = await readOrder(db, orderId);
	assertNoAddressLeft(order);
	assert.equal(order.user_id, null);
	assert.equal(order.company_info_tax_number, "402700000012");
	assert.equal((await readHistoryComments(db, orderId))[0].comment, null);
});

// ─── Обезличивание заказов ──────────────────────────────────────────────────
//
// Данные создаются в транзакции и откатываются: в базе ничего не остаётся.

class Rollback extends Error {}

async function inRolledBackTransaction(fn: (tx: Executor) => Promise<void>) {
	try {
		await drizzleOf(payload).transaction(async (tx) => {
			await fn(tx);
			throw new Rollback();
		});
	} catch (error) {
		if (!(error instanceof Rollback)) throw error;
	}
}

/**
 * Заказ, в котором заполнены ВСЕ текстовые колонки адреса — список берётся из
 * самой базы. Новая колонка попадёт сюда сама, и тест упадёт, пока её не внесут
 * в ORDER_PERSONAL_COLUMNS: так однажды адрес и пережил удаление аккаунта.
 */
async function insertFullOrder(
	db: Executor,
	options: { key: string; userId: number | null; email?: string },
): Promise<number> {
	const addressColumns = await query(
		db,
		sql`SELECT column_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'orders'
			AND column_name LIKE 'delivery\\_address\\_%'
			AND data_type = 'character varying'`,
	);
	const filled = addressColumns.map((row) => String(row.column_name));
	const [row] = await query(
		db,
		sql`INSERT INTO orders (
			order_number, user_id, status, recipient_full_name, recipient_email,
			delivery_method, payment_method, pricing_subtotal, pricing_total,
			recipient_phone, recipient_contact_person,
			contact_phone, contact_preferred, contact_customer_phone,
			delivery_address_source, delivery_tracking_number, delivery_notes,
			company_info_name, company_info_tax_number, company_info_contact_person,
			notes, internal_notes, ip_address, user_agent
		) VALUES (
			${`${TAG}-${RUN}-${options.key}`}, ${options.userId}, 'delivered', 'Анна Покупатель',
			${options.email ?? `${TAG}-${RUN}-${options.key}@example.test`},
			'door_to_door', 'invoice', 1000, 1000,
			'+79990000000', 'Контактное лицо',
			'+79990000001', 'customer', '+79990000002',
			'dadata', 'TRACK-1', 'Домофон не работает',
			'ИП Покупатель', '402700000012', 'Представитель',
			'Позвонить заранее', 'Заметка менеджера', '10.0.0.1', 'Браузер'
		) RETURNING id`,
	);
	const id = Number(row.id);
	await db.execute(
		sql`UPDATE orders SET ${sql.raw(filled.map((column) => `"${column}" = 'значение'`).join(", "))} WHERE id = ${id}`,
	);
	await db.execute(
		sql`INSERT INTO orders_status_history (_order, _parent_id, id, status, changed_at, comment)
		VALUES (1, ${id}, ${`${TAG}-${RUN}-${options.key}`}, 'cancelled', NOW(), 'Заберёт сосед, телефон 8999')`,
	);
	return id;
}

async function readOrder(db: Executor, id: number) {
	const row = await queryOne(db, sql`SELECT * FROM orders WHERE id = ${id}`);
	assert.ok(row);
	return row;
}

async function readHistoryComments(db: Executor, id: number) {
	const rows = await query(
		db,
		sql`SELECT comment, status FROM orders_status_history WHERE _parent_id = ${id}`,
	);
	return rows;
}

function assertNoAddressLeft(row: Record<string, unknown>) {
	const address = Object.keys(row).filter((key) =>
		key.startsWith("delivery_address_"),
	);
	assert.ok(address.length >= 20, "колонки адреса должны быть найдены");
	for (const column of address) {
		assert.equal(row[column], null, `${column} должна быть пустой`);
	}
}

test("в списке обезличивания есть все колонки адреса из базы", async () => {
	const rows = await query(
		drizzleOf(payload),
		sql`SELECT column_name FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'orders'
			AND column_name LIKE 'delivery\\_address\\_%'`,
	);
	const listed = new Set<string>(ORDER_PERSONAL_COLUMNS);
	const missing = rows
		.map((row) => String(row.column_name))
		.filter((column) => !listed.has(column));
	assert.deepEqual(missing, []);
});

test("обезличивание: адрес и данные покупателя очищены, учёт остался", async () => {
	await inRolledBackTransaction(async (tx) => {
		const [user] = await query(
			tx,
			sql`INSERT INTO users (email, name) VALUES (${`${TAG}-${RUN}-anon@example.test`}, 'Анна') RETURNING id`,
		);
		const userId = Number(user.id);
		const id = await insertFullOrder(tx, { key: "anon", userId });

		await anonymizeOrdersOfUser(tx, userId);
		const row = await readOrder(tx, id);

		assertNoAddressLeft(row);
		for (const column of ORDER_PERSONAL_COLUMNS) {
			assert.equal(row[column], null, `${column} должна быть пустой`);
		}
		assert.equal(row.user_id, null);
		assert.equal(row.recipient_full_name, "Удалено по запросу субъекта данных");
		assert.equal(row.recipient_email, `deleted-order-${id}@example.invalid`);

		// То, что закон требует хранить, на месте.
		assert.equal(row.order_number, `${TAG}-${RUN}-anon`);
		assert.equal(row.status, "delivered");
		assert.equal(Number(row.pricing_total), 1000);
		assert.equal(row.company_info_name, "ИП Покупатель");
		assert.equal(row.company_info_tax_number, "402700000012");

		// Запись истории остаётся, свободный текст — нет.
		const history = await readHistoryComments(tx, id);
		assert.equal(history.length, 1);
		assert.equal(history[0].status, "cancelled");
		assert.equal(history[0].comment, null);
	});
});

test("обезличивание не задевает заказы других покупателей", async () => {
	await inRolledBackTransaction(async (tx) => {
		const users = await query(
			tx,
			sql`INSERT INTO users (email, name) VALUES
				(${`${TAG}-${RUN}-a@example.test`}, 'Анна'),
				(${`${TAG}-${RUN}-b@example.test`}, 'Борис') RETURNING id`,
		);
		const own = Number(users[0].id);
		const other = Number(users[1].id);
		await insertFullOrder(tx, { key: "own", userId: own });
		const otherOrder = await insertFullOrder(tx, {
			key: "other",
			userId: other,
		});

		await anonymizeOrdersOfUser(tx, own);
		const row = await readOrder(tx, otherOrder);

		assert.equal(Number(row.user_id), other);
		assert.equal(row.delivery_address_full_address, "значение");
		assert.equal(row.recipient_phone, "+79990000000");
		const history = await readHistoryComments(tx, otherOrder);
		assert.notEqual(history[0].comment, null);
	});
});

test("дочистка: только старые обезличенные заказы, повторно ничего не меняет", async () => {
	await inRolledBackTransaction(async (tx) => {
		const baseline = await countAnonymizedOrdersWithLeftovers(tx);

		// Как после старой версии запроса: адрес и причина отмены на месте.
		const stale = await insertFullOrder(tx, { key: "stale", userId: null });
		await tx.execute(
			sql`UPDATE orders SET recipient_email = CONCAT('deleted-order-', id, '@example.invalid') WHERE id = ${stale}`,
		);
		// Перенесён без владельца: заказ живой, хоть и без user_id.
		const ownerless = await insertFullOrder(tx, {
			key: "ownerless",
			userId: null,
		});
		// Адрес похож, но id чужой: это не наш служебный адрес.
		const lookalike = await insertFullOrder(tx, {
			key: "lookalike",
			userId: null,
			email: "deleted-order-1@example.invalid",
		});
		// Обычный заказ живого покупателя.
		const [user] = await query(
			tx,
			sql`INSERT INTO users (email, name) VALUES (${`${TAG}-${RUN}-live@example.test`}, 'Анна') RETURNING id`,
		);
		const live = await insertFullOrder(tx, {
			key: "live",
			userId: Number(user.id),
		});

		assert.equal(await countAnonymizedOrdersWithLeftovers(tx), baseline + 1);
		await scrubAnonymizedOrders(tx);

		const scrubbed = await readOrder(tx, stale);
		assertNoAddressLeft(scrubbed);
		assert.equal(scrubbed.internal_notes, null);
		assert.equal(scrubbed.delivery_tracking_number, null);
		assert.equal(scrubbed.company_info_tax_number, "402700000012");
		assert.equal((await readHistoryComments(tx, stale))[0].comment, null);

		for (const id of [ownerless, lookalike, live]) {
			const row = await readOrder(tx, id);
			assert.equal(row.delivery_address_full_address, "значение");
			assert.equal(row.internal_notes, "Заметка менеджера");
			assert.notEqual((await readHistoryComments(tx, id))[0].comment, null);
		}

		assert.equal(await countAnonymizedOrdersWithLeftovers(tx), 0);
		const updatedAt = scrubbed.updated_at;
		await scrubAnonymizedOrders(tx);
		const again = await readOrder(tx, stale);
		assert.deepEqual(again.updated_at, updatedAt);
	});
});
