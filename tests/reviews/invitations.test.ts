/**
 * Предложения оставить отзыв — раздел «Можно оценить».
 *
 *   pnpm test:reviews
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЭТОТ НАБОР ХОДИТ В БАЗУ, В ОТЛИЧИЕ ОТ ОСТАЛЬНЫХ
 * ────────────────────────────────────────────────────────────────────────────
 * Проверяемое правило целиком живёт в SQL (getReviewInvitations): дедупликация
 * по товару, три условия доступности товара, отсечение уже написанных отзывов
 * и незавершённых заказов. Проверять его подделкой данных в памяти
 * бессмысленно — подделка проверяла бы саму себя, а не запрос. Ошибка же
 * здесь не падает, а тихо предлагает оценить снятый с продажи товар или
 * прячет предложение у живого покупателя.
 *
 * Поэтому набор исключён из `pnpm test` и запускается отдельно: остальные
 * наборы принципиально не требуют окружения, и тянуть их в зависимость от
 * поднятого Postgres ради одного файла нельзя.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Всё создаётся под своей меткой (TAG) и удаляется в after() — в том числе
 * когда набор упал посередине. Чужих записей тест не трогает и на данные,
 * уже лежащие в базе, не опирается: пользователь у него собственный, и
 * выдача по нему обязана состоять ровно из его товаров.
 *
 * Порядок уборки продиктован внешними ключами. Оформление заказа заводит
 * in-app уведомление (notifications.user_id — NOT NULL при ON DELETE SET
 * NULL), поэтому пользователя нельзя удалить, пока живы его уведомления:
 * Postgres откажет, а не обнулит связь.
 *
 * Набор запускается с --test-force-exit (см. скрипт test:reviews). Пул
 * соединений Payload держит event loop открытым после последнего теста, а
 * закрыть его штатно нельзя: db.destroy() пул не трогает, а pool.end() не
 * возвращается вовсе. Без флага `node --test` ждал бы дочерний процесс до
 * бесконечности, не напечатав ни строчки результатов.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getPayload } from "payload";
import config from "../../payload.config.ts";
import {
	countReviewInvitations,
	getReviewInvitations,
	hasUserPurchasedProduct,
} from "../../src/payload/services/reviews.service.ts";

const TAG = "review-invitations-test";

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

type Payload = Awaited<ReturnType<typeof getPayload>>;

let payload: Payload;
let userId: number;
let categoryId: number;

/** Созданное тестом — в порядке, обратном удалению. */
const created = {
	orders: [] as number[],
	reviews: [] as number[],
	products: [] as number[],
};

interface ProductSpec {
	key: string;
	status?: "available" | "preorder" | "out_of_stock" | "discontinued";
	isVisible?: boolean;
	published?: boolean;
}

async function makeProduct(spec: ProductSpec): Promise<number> {
	const doc = await payload.create({
		collection: "products",
		data: {
			title: `${TAG} ${spec.key}`,
			slug: `${TAG}-${RUN}-${spec.key}`,
			description: `${TAG} описание`,
			category: categoryId,
			pricing: { priceForIndividual: 1000 },
			inventory: {
				status: spec.status ?? "available",
				isVisible: spec.isVisible ?? true,
			},
			_status: spec.published === false ? "draft" : "published",
		},
		overrideAccess: true,
	});
	created.products.push(Number(doc.id));
	return Number(doc.id);
}

let orderSeq = 0;

/**
 * Заказ пользователя с перечисленными товарами.
 *
 * Номер проставляется явно, как это делает и seed-checkout-e2e: поле
 * уникально и обязательно, а генератор номеров в коллекции берёт максимум по
 * всей таблице — то есть результат зависел бы от того, что уже лежит в базе.
 * Собственная нумерация с меткой прогона делает набор независимым от неё.
 */
async function makeOrder(
	status: "delivered" | "pending" | "cancelled",
	items: { product: number; quantity: number }[],
	createdAt: string = new Date().toISOString(),
): Promise<number> {
	const doc = await payload.create({
		collection: "orders",
		data: {
			orderNumber: `ORD-${RUN}-${String(++orderSeq).padStart(4, "0")}`,
			user: userId,
			status,
			// Дата покупки задаётся явно: у перенесённых заказов она своя, и
			// порядок предложений считается именно по ней (см. миграцию
			// исторических заказов — она сохраняет исходный createdAt).
			createdAt,
			recipient: {
				fullName: `${TAG} получатель`,
				phone: "+79990000000",
				email: `${TAG}-${RUN}@example.test`,
			},
			delivery: { method: "self_pickup" },
			payment: { method: "invoice" },
			items: items.map((item) => ({
				product: item.product,
				name: `${TAG} позиция`,
				quantity: item.quantity,
				unitPrice: 1000,
				totalPrice: 1000 * item.quantity,
			})),
			pricing: { subtotal: 1000, total: 1000 },
		},
		overrideAccess: true,
	});
	created.orders.push(Number(doc.id));
	return Number(doc.id);
}

async function makeReview(productId: number, status: string): Promise<void> {
	const doc = await payload.create({
		collection: "product-reviews",
		data: {
			user: userId,
			product: productId,
			rating: 5,
			comment: `${TAG} комментарий`,
			status: status as "pending" | "approved" | "rejected",
		},
		overrideAccess: true,
	});
	created.reviews.push(Number(doc.id));
}

/** Идентификаторы товаров в выдаче — в том порядке, в каком их вернул запрос. */
async function invitedProductIds(): Promise<string[]> {
	const page = await getReviewInvitations(userId, { limit: 50 });
	return page.invitations.map((item) => item.product.id);
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
			name: "Тест Предложений",
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
		const notifications = await payload.find({
			collection: "notifications",
			where: { user: { equals: userId } },
			limit: 500,
			depth: 0,
			overrideAccess: true,
		});
		await remove(
			"notifications",
			notifications.docs.map((doc) => doc.id),
		);
	}

	await remove("products", created.products);
	if (userId) await remove("users", [userId]);
	if (categoryId) await remove("categories", [categoryId]);
});

/* ------------------------------------------------------------- дедупликация */

test("несколько заказов одного товара дают ОДНО предложение", async () => {
	const product = await makeProduct({ key: "repeat" });

	await makeOrder("delivered", [{ product, quantity: 1 }]);
	await makeOrder("delivered", [{ product, quantity: 3 }]);
	await makeOrder("delivered", [{ product, quantity: 1 }]);

	const page = await getReviewInvitations(userId, { limit: 50 });
	const forProduct = page.invitations.filter(
		(item) => item.product.id === String(product),
	);

	assert.equal(forProduct.length, 1, "товар обязан встретиться ровно один раз");
	assert.equal(
		forProduct[0]?.ordersCount,
		3,
		"три заказа обязаны сосчитаться, не превращаясь в три предложения",
	);
	assert.equal(await countReviewInvitations(userId), 1);
});

test("несколько единиц в одном заказе не дублируют предложение", async () => {
	const product = await makeProduct({ key: "qty" });
	await makeOrder("delivered", [{ product, quantity: 7 }]);

	const ids = await invitedProductIds();
	assert.equal(ids.filter((id) => id === String(product)).length, 1);
});

/* ------------------------------------------------- доступность товара */

test("снятый с производства товар предложения не даёт", async () => {
	const product = await makeProduct({ key: "gone", status: "discontinued" });
	await makeOrder("delivered", [{ product, quantity: 1 }]);

	assert.ok(!(await invitedProductIds()).includes(String(product)));
});

test("скрытый из каталога товар предложения не даёт", async () => {
	const product = await makeProduct({ key: "hidden", isVisible: false });
	await makeOrder("delivered", [{ product, quantity: 1 }]);

	assert.ok(!(await invitedProductIds()).includes(String(product)));
});

test("неопубликованный товар предложения не даёт", async () => {
	const product = await makeProduct({ key: "draft", published: false });
	await makeOrder("delivered", [{ product, quantity: 1 }]);

	assert.ok(!(await invitedProductIds()).includes(String(product)));
});

test("«нет в наличии» предложение НЕ отменяет — страница товара жива", async () => {
	const product = await makeProduct({ key: "oos", status: "out_of_stock" });
	await makeOrder("delivered", [{ product, quantity: 1 }]);

	assert.ok((await invitedProductIds()).includes(String(product)));
});

test("в одном заказе живой товар остаётся, снятый — отсекается", async () => {
	const alive = await makeProduct({ key: "mixed-alive" });
	const dead = await makeProduct({ key: "mixed-dead", status: "discontinued" });
	await makeOrder("delivered", [
		{ product: alive, quantity: 1 },
		{ product: dead, quantity: 1 },
	]);

	const ids = await invitedProductIds();
	assert.ok(ids.includes(String(alive)));
	assert.ok(!ids.includes(String(dead)));
});

/* ------------------------------------------------------- статус заказа */

test("незавершённый заказ предложения не даёт", async () => {
	const product = await makeProduct({ key: "pending-order" });
	await makeOrder("pending", [{ product, quantity: 1 }]);

	assert.ok(!(await invitedProductIds()).includes(String(product)));
});

test("отменённый заказ предложения не даёт", async () => {
	const product = await makeProduct({ key: "cancelled-order" });
	await makeOrder("cancelled", [{ product, quantity: 1 }]);

	assert.ok(!(await invitedProductIds()).includes(String(product)));
});

test("товар из завершённого заказа предложение даёт, даже если тот же товар есть в незавершённом", async () => {
	const product = await makeProduct({ key: "both-orders" });
	await makeOrder("pending", [{ product, quantity: 1 }]);
	await makeOrder("delivered", [{ product, quantity: 1 }]);

	const ids = await invitedProductIds();
	assert.equal(ids.filter((id) => id === String(product)).length, 1);
});

/* ------------------------------------------------------- уже есть отзыв */

for (const status of ["pending", "approved", "rejected"] as const) {
	test(`отзыв в статусе ${status} снимает предложение`, async () => {
		const product = await makeProduct({ key: `reviewed-${status}` });
		await makeOrder("delivered", [{ product, quantity: 1 }]);

		assert.ok(
			(await invitedProductIds()).includes(String(product)),
			"до отзыва предложение обязано быть",
		);

		await makeReview(product, status);

		assert.ok(
			!(await invitedProductIds()).includes(String(product)),
			"после отзыва предложение обязано исчезнуть в ЛЮБОМ статусе: " +
				"повторный отзыв на товар запрещён, и звать на него нельзя",
		);
	});
}

/* ------------------------------------------------------------- выдача */

test("порядок — от свежей покупки к давней", async () => {
	const older = await makeProduct({ key: "order-older" });
	const newer = await makeProduct({ key: "order-newer" });

	await makeOrder(
		"delivered",
		[{ product: older, quantity: 1 }],
		"2020-01-01T00:00:00.000Z",
	);
	await makeOrder(
		"delivered",
		[{ product: newer, quantity: 1 }],
		"2024-01-01T00:00:00.000Z",
	);

	const ids = await invitedProductIds();
	assert.ok(
		ids.indexOf(String(newer)) < ids.indexOf(String(older)),
		"свежая покупка обязана стоять выше давней",
	);
});

test("счётчик сходится с длиной выдачи", async () => {
	const count = await countReviewInvitations(userId);
	const ids = await invitedProductIds();
	assert.equal(
		count,
		ids.length,
		"число на панели и список под ней обязаны считаться одним правилом",
	);
});

test("страницы не пересекаются и не теряют товар", async () => {
	const all = await invitedProductIds();
	if (all.length < 2) return;

	const first = await getReviewInvitations(userId, { page: 1, limit: 1 });
	const second = await getReviewInvitations(userId, { page: 2, limit: 1 });

	assert.equal(first.invitations.length, 1);
	assert.equal(first.hasNextPage, true);
	assert.notEqual(
		first.invitations[0]?.product.id,
		second.invitations[0]?.product.id,
	);
	assert.equal(first.invitations[0]?.product.id, all[0]);
	assert.equal(second.invitations[0]?.product.id, all[1]);
});

test("у пользователя без заказов предложений нет", async () => {
	const stranger = await payload.create({
		collection: "users",
		data: {
			email: `${TAG}-stranger-${RUN}@example.test`,
			password: `${TAG}-Password-1`,
			name: "Без Покупок",
			role: "user",
			status: "active",
		},
		overrideAccess: true,
	});

	try {
		const page = await getReviewInvitations(Number(stranger.id));
		assert.deepEqual(page.invitations, []);
		assert.equal(page.hasNextPage, false);
		assert.equal(await countReviewInvitations(Number(stranger.id)), 0);
	} finally {
		await payload.delete({
			collection: "users",
			id: stranger.id,
			overrideAccess: true,
		});
	}
});

/* ---------------------------------------------------------- чужие покупки */

test("покупка одного пользователя не попадает в предложения другого", async () => {
	const product = await makeProduct({ key: "foreign" });
	await makeOrder("delivered", [{ product, quantity: 1 }]);

	assert.ok(
		(await invitedProductIds()).includes(String(product)),
		"у покупателя предложение обязано быть",
	);

	const stranger = await payload.create({
		collection: "users",
		data: {
			email: `${TAG}-foreign-${RUN}@example.test`,
			password: `${TAG}-Password-1`,
			name: "Чужой Покупатель",
			role: "user",
			status: "active",
		},
		overrideAccess: true,
	});

	try {
		// Выдача считается от пользователя, а не от товара: подставить чужой id
		// и получить чужую историю покупок нельзя, потому что сам id на витрине
		// приходит не от клиента, а из getCurrentUser (см. серверные действия).
		const page = await getReviewInvitations(Number(stranger.id));
		assert.deepEqual(page.invitations, [], "чужая покупка не даёт предложения");

		// Право оставить отзыв проверяется тем же фактом покупки — иначе
		// предложение можно было бы обойти, отправив отзыв напрямую.
		assert.equal(
			await hasUserPurchasedProduct(Number(stranger.id), product),
			false,
		);
		assert.equal(await hasUserPurchasedProduct(userId, product), true);
	} finally {
		await payload.delete({
			collection: "users",
			id: stranger.id,
			overrideAccess: true,
		});
	}
});

test("нечисловой идентификатор пользователя не роняет выборку", async () => {
	const page = await getReviewInvitations("не-число");
	assert.deepEqual(page.invitations, []);
	assert.equal(await countReviewInvitations("не-число"), 0);
});
