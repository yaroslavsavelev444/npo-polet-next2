/**
 * «Сообщить о поступлении»: подписка, обнаружение возвращения товара в
 * продажу и рассылка внутрисайтовых уведомлений.
 *
 *   pnpm test:restock
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОВЕРЯЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Подписка идемпотентна: повтор не создаёт вторую строку.
 *  2. Пока товар нельзя заказать, рассылка ничего не трогает.
 *  3. Товар вернулся — каждый подписчик получает ровно одно уведомление,
 *     подписки закрываются, повтор рассылки ничего не дублирует.
 *  4. Параллельные пачки по одному товару не дают дублей.
 *  5. Хук товара ставит задачу в очередь только на переходе «нельзя → можно»
 *     и только если товар кто-то ждёт.
 *
 * Как и test:reviews, набор ходит в настоящие Postgres и Redis и поэтому
 * исключён из `pnpm test`.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Queue } from "bullmq";
import { sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import config from "../../payload.config.ts";
import { redisConfig } from "../../src/modules/auth/lib/redis-config.ts";
import { RESTOCK_QUEUE } from "../../src/modules/restock/lib/constants.ts";
import { processRestockForProduct } from "../../src/modules/restock/lib/process.ts";
import { closeRestockQueue } from "../../src/modules/restock/lib/queue.ts";
import {
	insertRestockSubscription,
	notifyRestockBatch,
} from "../../src/payload/services/restock-subscriptions.db.ts";

const TAG = "restock-test";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type Payload = Awaited<ReturnType<typeof getPayload>>;

let payload: Payload;
let categoryId: number;
let queue: Queue;
const userIds: number[] = [];
const productIds: number[] = [];

async function makeUser(key: string): Promise<number> {
	const user = await payload.create({
		collection: "users",
		data: {
			email: `${TAG}-${RUN}-${key}@example.test`,
			password: `${TAG}-Password-1`,
			name: `Тест ${key}`,
			role: "user",
			status: "active",
		},
		overrideAccess: true,
	});
	userIds.push(Number(user.id));
	return Number(user.id);
}

async function makeProduct(
	key: string,
	status: "available" | "out_of_stock" | "discontinued",
): Promise<number> {
	const doc = await payload.create({
		collection: "products",
		data: {
			title: `${TAG} ${key}`,
			slug: `${TAG}-${RUN}-${key}`,
			description: `${TAG} описание`,
			category: categoryId,
			pricing: { priceForIndividual: 1000 },
			inventory: { status, isVisible: true },
			_status: "published",
		},
		overrideAccess: true,
	});
	productIds.push(Number(doc.id));
	return Number(doc.id);
}

async function setProductStatus(
	productId: number,
	status: "available" | "out_of_stock",
	extra: Record<string, unknown> = {},
): Promise<void> {
	await payload.update({
		collection: "products",
		id: productId,
		data: { inventory: { status }, _status: "published", ...extra },
		overrideAccess: true,
	});
}

async function subscriptionCount(productId: number): Promise<number> {
	const result = (await payload.db.drizzle.execute(sql`
		SELECT count(*)::int AS n FROM restock_subscriptions WHERE product_id = ${productId}
	`)) as { rows: { n: number }[] };
	return result.rows[0].n;
}

async function restockNotifications(userId: number, productId: number) {
	const { docs } = await payload.find({
		collection: "notifications",
		where: {
			and: [
				{ user: { equals: userId } },
				{ type: { equals: "product" } },
				{ "data.productId": { equals: productId } },
			],
		},
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	return docs;
}

/** Хук ставит задачу через `void` — ждём её появления опросом. */
async function waitForJob(productId: number, timeoutMs = 3000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const job = await queue.getJob(`restock-product-${productId}`);
		if (job || Date.now() > deadline) return job;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

before(async () => {
	payload = await getPayload({ config });
	queue = new Queue(RESTOCK_QUEUE, { connection: redisConfig });

	const category = await payload.create({
		collection: "categories",
		data: { name: `${TAG} категория`, slug: `${TAG}-${RUN}-category` },
		overrideAccess: true,
	});
	categoryId = Number(category.id);
});

after(async () => {
	const remove = async (collection: string, ids: number[]) => {
		for (const id of ids) {
			try {
				await payload.delete({
					collection: collection as never,
					id,
					overrideAccess: true,
				});
			} catch {
				// Уборка не должна прятать настоящую причину падения теста.
			}
		}
	};

	for (const productId of productIds) {
		const job = await queue.getJob(`restock-product-${productId}`);
		await job?.remove();
	}
	await queue.close();
	await closeRestockQueue();

	for (const userId of userIds) {
		const notes = await payload.find({
			collection: "notifications",
			where: { user: { equals: userId } },
			limit: 500,
			depth: 0,
			overrideAccess: true,
		});
		await remove(
			"notifications",
			notes.docs.map((doc) => Number(doc.id)),
		);
	}
	// Подписки уходят каскадом вместе с товарами и пользователями.
	await remove("products", productIds);
	await remove("users", userIds);
	if (categoryId) await remove("categories", [categoryId]);
	process.exit(0);
});

test("повторная подписка не создаёт дубль", async () => {
	const userId = await makeUser("idem");
	const productId = await makeProduct("idem", "out_of_stock");

	await insertRestockSubscription(payload, userId, productId);
	await insertRestockSubscription(payload, userId, productId);

	assert.equal(await subscriptionCount(productId), 1);
});

test("пока товар нельзя заказать, рассылка ничего не трогает", async () => {
	const userId = await makeUser("wait");
	const productId = await makeProduct("wait", "out_of_stock");
	await insertRestockSubscription(payload, userId, productId);

	const result = await processRestockForProduct(payload, productId);

	assert.deepEqual(result, { status: "not_orderable" });
	assert.equal(await subscriptionCount(productId), 1);
	assert.equal((await restockNotifications(userId, productId)).length, 0);
});

test("возвращение в продажу: одно уведомление каждому, подписки закрыты", async () => {
	const a = await makeUser("back-a");
	const b = await makeUser("back-b");
	const productId = await makeProduct("back", "out_of_stock");
	await insertRestockSubscription(payload, a, productId);
	await insertRestockSubscription(payload, b, productId);

	await setProductStatus(productId, "available");
	const first = await processRestockForProduct(payload, productId);
	// Повтор задачи (ретрай BullMQ, страховочный обход) — не второе уведомление.
	const second = await processRestockForProduct(payload, productId);

	assert.deepEqual(first, { status: "notified", count: 2 });
	assert.deepEqual(second, { status: "notified", count: 0 });
	assert.equal(await subscriptionCount(productId), 0);

	for (const userId of [a, b]) {
		const notes = await restockNotifications(userId, productId);
		assert.equal(notes.length, 1);
		assert.equal(notes[0].title, "Товар снова в продаже");
		assert.match(String(notes[0].link), /\/products\//);
		assert.equal(notes[0].isRead, false);
	}
});

test("параллельные пачки по одному товару не дают дублей", async () => {
	const users = await Promise.all(
		["p1", "p2", "p3", "p4", "p5"].map((key) => makeUser(key)),
	);
	const productId = await makeProduct("parallel", "available");
	for (const userId of users) {
		await insertRestockSubscription(payload, userId, productId);
	}

	const input = {
		productId,
		productTitle: "параллельный",
		productUrl: "/category/all/products/x",
		limit: 2,
	};
	const counts = await Promise.all([
		notifyRestockBatch(payload, input),
		notifyRestockBatch(payload, input),
		notifyRestockBatch(payload, input),
		notifyRestockBatch(payload, input),
	]);

	assert.equal(
		counts.reduce((sum, n) => sum + n, 0),
		5,
	);
	for (const userId of users) {
		assert.equal((await restockNotifications(userId, productId)).length, 1);
	}
});

test("хук ставит задачу только на переходе «нельзя → можно» и при подписчиках", async () => {
	const userId = await makeUser("hook");
	const watched = await makeProduct("hook-watched", "out_of_stock");
	const lonely = await makeProduct("hook-lonely", "out_of_stock");
	await insertRestockSubscription(payload, userId, watched);

	// Правка недоступного товара — не переход.
	await payload.update({
		collection: "products",
		id: watched,
		data: { description: `${TAG} правка` },
		overrideAccess: true,
	});
	assert.equal(await waitForJob(watched, 800), undefined);

	await setProductStatus(watched, "available");
	await setProductStatus(lonely, "available");

	const job = await waitForJob(watched);
	assert.ok(job, "задача по товару с подписчиком должна появиться");
	assert.deepEqual(job.data, { productId: watched });
	// Товар никто не ждёт — очередь не трогаем.
	assert.equal(await waitForJob(lonely, 800), undefined);

	// Сохранение уже доступного товара — тоже не переход: задача та же
	// (jobId на товар), второй не появляется.
	await job.remove();
	await payload.update({
		collection: "products",
		id: watched,
		data: { description: `${TAG} правка цены` },
		overrideAccess: true,
	});
	assert.equal(await waitForJob(watched, 800), undefined);
});
