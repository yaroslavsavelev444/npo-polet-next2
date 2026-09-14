/**
 * Приглашение оценить товары при переходе заказа в «доставлен».
 *
 *   pnpm test:reviews
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ИМЕННО ПРОВЕРЯЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Не текст уведомления, а три правила, каждое из которых молча ломается:
 *
 *  1. приглашение приходит только когда есть что оценивать — иначе оно ведёт
 *     в пустой раздел;
 *  2. приглашение не повторяется, если статус заказа вернули и снова выставили
 *     «доставлен» (в админке это обычный выпадающий список без ограничений на
 *     переходы);
 *  3. счётчик баннера (`pendingReviews`) и раздел «Можно оценить» считаются
 *     ОДНИМ правилом — разойдясь, они дают баннер, зовущий в пустоту.
 *
 * Набор ходит в базу по той же причине, что и invitations.test.ts, и так же
 * исключён из `pnpm test`. Хук заказа вызывает приглашение через `void`, не
 * дожидаясь его, поэтому уведомление здесь ждут опросом, а не сразу после
 * update.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getPayload } from "payload";
import config from "../../payload.config.ts";
import { collectAudienceFacts } from "../../src/modules/banners/server/facts.ts";
import {
	countReviewInvitations,
	filterReviewableProducts,
} from "../../src/payload/services/reviews.service.ts";

const TAG = "delivered-invitation-test";
/**
 * Метка прогона. Slug товара, slug категории и номер заказа уникальны в базе,
 * поэтому фикстуры обязаны быть уникальны дважды.
 *
 * По ПРОГОНАМ — иначе набор, прерванный до уборки (Ctrl+C, падение
 * окружения), навсегда ломал бы все последующие запуски: первый же create
 * падал бы на занятом slug.
 *
 * По ФАЙЛАМ — и это не теория: `node --test` запускает файлы НАПАРАЛЛЕЛЬНО,
 * модули обоих наборов загружаются в одну и ту же миллисекунду, и одного
 * `Date.now()` им не хватает. Случайный хвост разводит их гарантированно.
 */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const INVITATION_LINK = "/profile/reviews?status=to-review";

type Payload = Awaited<ReturnType<typeof getPayload>>;

let payload: Payload;
let userId: number;
let categoryId: number;
let orderSeq = 0;

const created = {
	orders: [] as number[],
	reviews: [] as number[],
	products: [] as number[],
};

async function makeProduct(
	key: string,
	status:
		| "available"
		| "preorder"
		| "out_of_stock"
		| "discontinued" = "available",
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
	created.products.push(Number(doc.id));
	return Number(doc.id);
}

/** Заказ создаётся НЕ доставленным: приглашение обязан выдать переход, а не создание. */
async function makeOrder(productIds: number[]): Promise<number> {
	const doc = await payload.create({
		collection: "orders",
		data: {
			orderNumber: `ORD-${RUN}-${String(++orderSeq).padStart(4, "0")}`,
			user: userId,
			status: "processing",
			recipient: {
				fullName: `${TAG} получатель`,
				phone: "+79990000000",
				email: `${TAG}-${RUN}@example.test`,
			},
			delivery: { method: "self_pickup" },
			payment: { method: "invoice" },
			items: productIds.map((product) => ({
				product,
				name: `${TAG} позиция`,
				quantity: 1,
				unitPrice: 1000,
				totalPrice: 1000,
			})),
			pricing: { subtotal: 1000, total: 1000 },
		},
		overrideAccess: true,
	});
	created.orders.push(Number(doc.id));
	return Number(doc.id);
}

async function setStatus(orderId: number, status: string): Promise<void> {
	await payload.update({
		collection: "orders",
		id: orderId,
		data: { status: status as "delivered" },
		overrideAccess: true,
	});
}

/** Приглашения пользователя — отбор тот же, что у проверки повтора в сервисе. */
async function invitations(): Promise<
	{ body: string; orderNumber: unknown }[]
> {
	const { docs } = await payload.find({
		collection: "notifications",
		where: {
			and: [
				{ user: { equals: userId } },
				{ type: { equals: "review" } },
				{ link: { equals: INVITATION_LINK } },
			],
		},
		sort: "-createdAt",
		limit: 100,
		depth: 0,
		overrideAccess: true,
	});
	return docs.map((doc) => ({
		body: String(doc.body),
		orderNumber: (doc.data as { orderNumber?: unknown } | null)?.orderNumber,
	}));
}

/**
 * Хук заказа запускает приглашение через `void` — к моменту возврата update
 * уведомления может ещё не быть. Ждём появления, а не спим фиксированно.
 */
async function waitForInvitations(
	expected: number,
	timeoutMs = 5000,
): Promise<{ body: string; orderNumber: unknown }[]> {
	const deadline = Date.now() + timeoutMs;
	let last = await invitations();
	while (last.length < expected && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 100));
		last = await invitations();
	}
	return last;
}

/**
 * Убедиться, что приглашение НЕ появилось, можно только выждав: мгновенная
 * проверка прошла бы и при поломке, просто опередив фоновую запись.
 */
async function expectNoNewInvitation(previousCount: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 1200));
	const now = await invitations();
	assert.equal(now.length, previousCount, "нового приглашения быть не должно");
}

before(async () => {
	payload = await getPayload({ config });

	const category = await payload.create({
		collection: "categories",
		data: { name: `${TAG} категория`, slug: `${TAG}-${RUN}-category` },
		overrideAccess: true,
	});
	categoryId = Number(category.id);

	const user = await payload.create({
		collection: "users",
		data: {
			email: `${TAG}-${RUN}@example.test`,
			password: `${TAG}-Password-1`,
			name: "Тест Приглашений",
			role: "user",
			status: "active",
		},
		overrideAccess: true,
	});
	userId = Number(user.id);
});

after(async () => {
	const remove = async (collection: string, ids: (number | string)[]) => {
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

	await remove("orders", created.orders);
	await remove("product-reviews", created.reviews);

	if (userId) {
		const notes = await payload.find({
			collection: "notifications",
			where: { user: { equals: userId } },
			limit: 500,
			depth: 0,
			overrideAccess: true,
		});
		await remove(
			"notifications",
			notes.docs.map((doc) => doc.id),
		);
	}

	await remove("products", created.products);
	if (userId) await remove("users", [userId]);
	if (categoryId) await remove("categories", [categoryId]);
});

/* ------------------------------------------------------- отбор товаров --- */

test("filterReviewableProducts пропускает только то, что реально можно оценить", async () => {
	const alive = await makeProduct("f-alive");
	const gone = await makeProduct("f-gone", "discontinued");
	const reviewed = await makeProduct("f-reviewed");

	const review = await payload.create({
		collection: "product-reviews",
		data: {
			user: userId,
			product: reviewed,
			rating: 4,
			comment: `${TAG} уже высказался`,
			status: "pending",
		},
		overrideAccess: true,
	});
	created.reviews.push(Number(review.id));

	const allowed = await filterReviewableProducts(userId, [
		alive,
		gone,
		reviewed,
	]);

	assert.deepEqual(allowed, [alive]);
});

test("пустой список товаров не идёт в базу и возвращает пусто", async () => {
	assert.deepEqual(await filterReviewableProducts(userId, []), []);
	assert.deepEqual(await filterReviewableProducts("не-число", [1]), []);
});

/* ----------------------------------------------------------- переход --- */

test("переход в «доставлен» создаёт приглашение с числом товаров", async () => {
	const first = await makeProduct("d-first");
	const second = await makeProduct("d-second");
	const order = await makeOrder([first, second]);

	assert.equal(
		(await invitations()).length,
		0,
		"до доставки приглашения быть не должно",
	);

	await setStatus(order, "delivered");
	const got = await waitForInvitations(1);

	assert.equal(got.length, 1);
	assert.match(
		got[0].body,
		/можно оценить 2 товара/,
		`ожидалось «2 товара» в винительном падеже, получено: ${got[0]?.body}`,
	);
});

test("повторный переход в «доставлен» приглашение не дублирует", async () => {
	const seen = (await invitations()).length;
	const order = created.orders[created.orders.length - 1];

	// Возврат статуса и повторная доставка — в админке это ничем не ограничено.
	await setStatus(order, "shipped");
	await setStatus(order, "delivered");

	await expectNoNewInvitation(seen);
});

test("заказ целиком из снятых с продажи товаров приглашения не даёт", async () => {
	const seen = (await invitations()).length;
	const dead = await makeProduct("d-dead", "discontinued");
	const order = await makeOrder([dead]);

	await setStatus(order, "delivered");

	await expectNoNewInvitation(seen);
});

test("в заказе со снятым и живым товаром приглашение считает только живой", async () => {
	const seen = (await invitations()).length;
	const alive = await makeProduct("d-mixed-alive");
	const dead = await makeProduct("d-mixed-dead", "discontinued");
	const order = await makeOrder([alive, dead]);

	await setStatus(order, "delivered");
	const got = await waitForInvitations(seen + 1);

	assert.equal(got.length, seen + 1);
	assert.match(
		got[0].body,
		/можно оценить товар из него/,
		`ожидалась форма единственного числа, получено: ${got[0]?.body}`,
	);
});

test("товар, уже оценённый ранее, повода для приглашения не создаёт", async () => {
	const seen = (await invitations()).length;
	const product = await makeProduct("d-reviewed");

	const review = await payload.create({
		collection: "product-reviews",
		data: {
			user: userId,
			product,
			rating: 5,
			comment: `${TAG} отзыв до доставки`,
			status: "approved",
		},
		overrideAccess: true,
	});
	created.reviews.push(Number(review.id));

	const order = await makeOrder([product]);
	await setStatus(order, "delivered");

	await expectNoNewInvitation(seen);
});

test("недоставленный заказ приглашения не даёт", async () => {
	const seen = (await invitations()).length;
	const product = await makeProduct("d-never");
	const order = await makeOrder([product]);

	await setStatus(order, "shipped");

	await expectNoNewInvitation(seen);
});

/* --------------------------------------------- согласованность с баннером --- */

test("счётчик баннера сходится с разделом «Можно оценить»", async () => {
	const facts = await collectAudienceFacts(userId);
	const section = await countReviewInvitations(userId);

	assert.ok(facts, "факты по активному пользователю обязаны собраться");
	assert.equal(
		facts.pendingReviews,
		section,
		"баннер и раздел обязаны считаться одним правилом: иначе баннер зовёт " +
			"оценить туда, где показывать нечего",
	);
});

test("снятый с продажи товар не попадает в счётчик баннера", async () => {
	const factsBefore = await collectAudienceFacts(userId);
	assert.ok(factsBefore);

	const dead = await makeProduct("b-dead", "discontinued");
	const order = await makeOrder([dead]);
	await setStatus(order, "delivered");

	const factsAfter = await collectAudienceFacts(userId);
	assert.ok(factsAfter);
	assert.equal(
		factsAfter.pendingReviews,
		factsBefore.pendingReviews,
		"доставленный, но снятый с продажи товар счётчик менять не должен",
	);
});
