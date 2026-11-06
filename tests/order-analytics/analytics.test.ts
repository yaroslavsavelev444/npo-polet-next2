/**
 * Расчёты аналитики заказов на настоящем Postgres.
 *
 * Весь набор данных создаётся внутри транзакции и откатывается: ни одной
 * записи в базе не остаётся. Данные лежат в 2015–2018 годах (Москва уже всегда UTC+3) — настоящие заказы в
 * проверяемые периоды не попадают.
 *
 * Два слоя проверки:
 *  1. Маленький набор, ответы посчитаны вручную (комментарий у каждого заказа).
 *  2. Случайный набор из 600 заказов: те же показатели считаются независимо на
 *     JS и сверяются с SQL. Так ловится то, чего ручной пример не предусмотрел.
 *
 *   pnpm test:order-analytics
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "@payloadcms/db-postgres";
import { getPayload, type Payload } from "payload";
import config from "../../payload.config.ts";
import { parseAnalyticsQuery } from "../../src/modules/order-analytics/lib/query.ts";
import type {
	CustomersDTO,
	FunnelDTO,
	GeoDTO,
	MetaDTO,
	OverviewDTO,
	ProductsDTO,
	ProductTableDTO,
} from "../../src/modules/order-analytics/lib/types.ts";
import { buildSection } from "../../src/modules/order-analytics/server/index.ts";
import {
	drizzleOf,
	type Executor,
	query,
} from "../../src/modules/support-chat/server/db.ts";

class Rollback extends Error {}

const MARCH = "period=custom&from=2018-03-01&to=2018-03-31";

interface SeedOrder {
	key: string;
	user?: number | null;
	status: string;
	/** Время заказа с явным поясом. */
	at: string;
	total: number;
	subtotal?: number;
	discount?: number;
	items: { product: number; qty: number; unit: number; line?: number }[];
	region?: string;
	city?: string;
	street?: string;
	delivery?: string;
	pickup?: number;
	payment?: string;
	paymentStatus?: string;
	paidAt?: string;
	promo?: string;
	companyName?: string;
	inn?: string;
	companyId?: number;
	history?: { status: string; at: string; comment?: string }[];
}

let sequence = 0;

async function insertOrder(db: Executor, order: SeedOrder): Promise<number> {
	sequence += 1;
	const [row] = await query(
		db,
		sql`INSERT INTO orders (
			order_number, user_id, status, created_at, updated_at,
			recipient_full_name, recipient_email,
			delivery_method, delivery_address_region, delivery_address_city, delivery_address_street,
			delivery_pickup_point_id,
			pricing_subtotal, pricing_discount, pricing_total,
			payment_method, payment_status, payment_paid_at,
			promo_code_code, company_info_name, company_info_tax_number, company_info_company_id_id
		) VALUES (
			${`AN-${order.key}-${sequence}`}, ${order.user ?? null}, ${order.status}, ${order.at}, ${order.at},
			'Получатель', 'analytics@example.test',
			${order.delivery ?? "door_to_door"}, ${order.region ?? null}, ${order.city ?? null}, ${order.street ?? null},
			${order.pickup ?? null},
			${order.subtotal ?? order.total}, ${order.discount ?? 0}, ${order.total},
			${order.payment ?? "invoice"}, ${order.paymentStatus ?? "pending"}, ${order.paidAt ?? null},
			${order.promo ?? null}, ${order.companyName ?? null}, ${order.inn ?? null}, ${order.companyId ?? null}
		) RETURNING id`,
	);
	const id = Number(row.id);
	let index = 0;
	for (const item of order.items) {
		index += 1;
		await db.execute(
			sql`INSERT INTO orders_items (_order, _parent_id, id, product_id, name, quantity, unit_price, total_price)
			VALUES (${index}, ${id}, ${`item-${sequence}-${index}`}, ${item.product}, 'Снимок', ${item.qty}, ${item.unit}, ${item.line ?? item.qty * item.unit})`,
		);
	}
	index = 0;
	for (const entry of order.history ?? []) {
		index += 1;
		await db.execute(
			sql`INSERT INTO orders_status_history (_order, _parent_id, id, status, changed_at, comment)
			VALUES (${index}, ${id}, ${`hist-${sequence}-${index}`}, ${entry.status}, ${entry.at}, ${entry.comment ?? null})`,
		);
	}
	return id;
}

async function insertUser(db: Executor, name: string): Promise<number> {
	sequence += 1;
	const [row] = await query(
		db,
		sql`INSERT INTO users (email, name) VALUES (${`analytics-${sequence}-${Date.now()}@example.test`}, ${name}) RETURNING id`,
	);
	return Number(row.id);
}

async function insertCategory(db: Executor, name: string): Promise<number> {
	sequence += 1;
	const [row] = await query(
		db,
		sql`INSERT INTO categories (slug) VALUES (${`analytics-${sequence}-${Date.now()}`}) RETURNING id`,
	);
	const id = Number(row.id);
	await db.execute(
		sql`INSERT INTO categories_locales (_locale, _parent_id, name) VALUES ('ru', ${id}, ${name})`,
	);
	return id;
}

async function insertProduct(
	db: Executor,
	title: string,
	categoryId: number,
): Promise<number> {
	const [row] = await query(
		db,
		sql`INSERT INTO products (category_id, _status, inventory_is_visible, inventory_status, brand_manufacturer, analytics_views_count)
		VALUES (${categoryId}, 'published', TRUE, 'available', 'Завод', 40) RETURNING id`,
	);
	const id = Number(row.id);
	await db.execute(
		sql`INSERT INTO products_locales (_locale, _parent_id, title) VALUES ('ru', ${id}, ${title})`,
	);
	return id;
}

/** Раздел товаров вместе с его таблицей: на странице это два запроса. */
type ProductsWithTable = ProductsDTO & Pick<ProductTableDTO, "ranking">;

type Results = {
	overview: OverviewDTO;
	overviewWeek: OverviewDTO;
	overviewYear: OverviewDTO;
	products: ProductsWithTable;
	productsSearch: ProductsWithTable;
	productsCat2: ProductsWithTable;
	productsAsc: ProductsWithTable;
	geo: GeoDTO;
	customers: CustomersDTO;
	funnel: FunnelDTO;
	meta: MetaDTO;
	legal: OverviewDTO;
	selfPickup: OverviewDTO;
	regionKaluga: OverviewDTO;
	category2: OverviewDTO;
	statusCancelled: OverviewDTO;
	statusVoidProducts: ProductsWithTable;
	emptyPeriod: OverviewDTO;
	emptyFunnel: FunnelDTO;
	emptyCustomers: CustomersDTO;
	emptyProducts: ProductsWithTable;
	emptyGeo: GeoDTO;
	customersFiltered: CustomersDTO;
	ids: Record<string, number>;
	random: {
		overview: OverviewDTO;
		customers: CustomersDTO;
		funnel: FunnelDTO;
		products: ProductsWithTable;
		page2: ProductTableDTO;
		pageOverflow: ProductTableDTO;
		expected: RandomExpected;
	};
};

interface RandomExpected {
	placed: number;
	orders: number;
	revenue: number;
	lost: number;
	units: number;
	positions: number;
	customers: number;
	newCustomers: number;
	repeatOrders: number;
	firstOrders: number;
	repeatCustomers: number;
	reached: number[];
	lost0: number;
	productUnits: Map<number, number>;
	productRevenue: Map<number, number>;
	productOrders: Map<number, number>;
}

/** Детерминированный генератор: провал теста воспроизводится. */
function makeRandom(seed: number) {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

const STAGE_RANK: Record<string, number> = {
	pending: 0,
	awaiting_invoice: 0,
	confirmed: 1,
	processing: 2,
	packed: 2,
	shipped: 3,
	ready_for_pickup: 3,
	delivered: 4,
};

async function seedRandom(
	db: Executor,
): Promise<{ query: string; expected: RandomExpected }> {
	const rand = makeRandom(20110301);
	const pick = <T>(list: readonly T[]) =>
		list[Math.floor(rand() * list.length)];

	const category = await insertCategory(db, "Случайная");
	const products: number[] = [];
	for (let i = 0; i < 32; i++) {
		products.push(await insertProduct(db, `Случайный ${i}`, category));
	}
	const users: number[] = [];
	for (let i = 0; i < 40; i++)
		users.push(await insertUser(db, `Случайный ${i}`));

	const STATUSES = [
		...Object.keys(STAGE_RANK),
		"delivered",
		"delivered",
		"cancelled",
		"refunded",
	];
	// 2015–2016: не пересекаются с ручным набором 2018 года и его клиентами.
	const from = Date.parse("2015-06-01T00:00:00+03:00");
	const to = Date.parse("2016-06-30T23:59:59+03:00");
	const periodFrom = Date.parse("2016-01-01T00:00:00+03:00");
	const periodTo = Date.parse("2016-04-01T00:00:00+03:00");

	const all: {
		user: number | null;
		at: number;
		status: string;
		total: number;
		items: { product: number; qty: number; unit: number }[];
	}[] = [];
	for (let i = 0; i < 600; i++) {
		const items = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({
			product: pick(products),
			qty: 1 + Math.floor(rand() * 4),
			unit: 100 * (1 + Math.floor(rand() * 50)),
		}));
		const total = items.reduce((sum, item) => sum + item.qty * item.unit, 0);
		const entry = {
			user: rand() < 0.1 ? null : pick(users),
			at: from + Math.floor(rand() * (to - from)),
			status: pick(STATUSES),
			total,
			items,
		};
		all.push(entry);
		await insertOrder(db, {
			key: `r${i}`,
			user: entry.user,
			status: entry.status,
			at: new Date(entry.at).toISOString(),
			total,
			items,
		});
	}

	const isVoid = (status: string) =>
		status === "cancelled" || status === "refunded";
	const inPeriod = all.filter((o) => o.at >= periodFrom && o.at < periodTo);
	const valid = inPeriod.filter((o) => !isVoid(o.status));

	const history = new Map<number, typeof all>();
	for (const order of all) {
		if (order.user === null || isVoid(order.status)) continue;
		const list = history.get(order.user) ?? [];
		list.push(order);
		history.set(order.user, list);
	}
	for (const list of history.values()) list.sort((a, b) => a.at - b.at);

	const customerIds = new Set(
		valid.flatMap((o) => (o.user === null ? [] : [o.user])),
	);
	let newCustomers = 0;
	let repeatCustomers = 0;
	for (const user of customerIds) {
		const list = history.get(user) ?? [];
		if (list[0].at >= periodFrom) newCustomers += 1;
		if (list.filter((o) => o.at < periodTo).length >= 2) repeatCustomers += 1;
	}
	let repeatOrders = 0;
	let firstOrders = 0;
	for (const order of valid) {
		if (order.user === null) continue;
		if (history.get(order.user)?.[0] === order) firstOrders += 1;
		else repeatOrders += 1;
	}

	const reached = [0, 0, 0, 0, 0];
	let lost0 = 0;
	for (const order of inPeriod) {
		if (isVoid(order.status)) {
			reached[0] += 1;
			lost0 += 1;
			continue;
		}
		for (let stage = 0; stage <= STAGE_RANK[order.status]; stage++) {
			reached[stage] += 1;
		}
	}

	const productUnits = new Map<number, number>();
	const productRevenue = new Map<number, number>();
	const productOrders = new Map<number, number>();
	for (const order of valid) {
		const seen = new Set<number>();
		for (const item of order.items) {
			productUnits.set(
				item.product,
				(productUnits.get(item.product) ?? 0) + item.qty,
			);
			productRevenue.set(
				item.product,
				(productRevenue.get(item.product) ?? 0) + item.qty * item.unit,
			);
			if (!seen.has(item.product)) {
				productOrders.set(
					item.product,
					(productOrders.get(item.product) ?? 0) + 1,
				);
				seen.add(item.product);
			}
		}
	}

	return {
		query: "period=custom&from=2016-01-01&to=2016-03-31",
		expected: {
			placed: inPeriod.length,
			orders: valid.length,
			revenue: valid.reduce((sum, o) => sum + o.total, 0),
			lost: inPeriod
				.filter((o) => isVoid(o.status))
				.reduce((sum, o) => sum + o.total, 0),
			units: valid.reduce(
				(sum, o) => sum + o.items.reduce((s, i) => s + i.qty, 0),
				0,
			),
			positions: valid.reduce((sum, o) => sum + o.items.length, 0),
			customers: customerIds.size,
			newCustomers,
			repeatOrders,
			firstOrders,
			repeatCustomers,
			reached,
			lost0,
			productUnits,
			productRevenue,
			productOrders,
		},
	};
}

async function compute(db: Executor): Promise<Results> {
	const u1 = await insertUser(db, "Анна Постоянная");
	const u2 = await insertUser(db, "Борис ИП");
	const u3 = await insertUser(db, "Вера Юрлицо");
	const u4 = await insertUser(db, "Глеб Самовывоз");
	const u5 = await insertUser(db, "Дина Отмена");
	const c1 = await insertCategory(db, "Аналитика-Раздел-1");
	const c2 = await insertCategory(db, "Аналитика-Раздел-2");
	const p1 = await insertProduct(db, "Аналитика Товар Один", c1);
	const p2 = await insertProduct(db, "Аналитика Товар Два", c2);
	const p3 = await insertProduct(db, "Аналитика Без Продаж", c1);

	const [company] = await query(
		db,
		sql`INSERT INTO companies (user_id, company_name, legal_address, tax_number)
		VALUES (${u3}, 'ООО Вера', 'Адрес', '4027000000') RETURNING id`,
	);
	const [pickup] = await query(
		db,
		sql`INSERT INTO pickup_points (name, city, address) VALUES ('Склад Калуга', 'Калуга', 'ул. Складская') RETURNING id`,
	);

	// История Анны до периода: январь и февраль. Февраль — в периоде сравнения.
	await insertOrder(db, {
		key: "A",
		user: u1,
		status: "delivered",
		at: "2018-01-15T12:00:00+03:00",
		total: 1000,
		items: [{ product: p1, qty: 2, unit: 500 }],
	});
	await insertOrder(db, {
		key: "Feb",
		user: u1,
		status: "delivered",
		at: "2018-02-10T12:00:00+03:00",
		total: 1000,
		items: [{ product: p1, qty: 2, unit: 500 }],
	});
	// B: третий заказ Анны, две позиции. 2000 ₽, 3 единицы.
	await insertOrder(db, {
		key: "B",
		user: u1,
		status: "delivered",
		at: "2018-03-05T12:00:00+03:00",
		total: 2000,
		items: [
			{ product: p1, qty: 2, unit: 500 },
			{ product: p2, qty: 1, unit: 1000 },
		],
		region: "Калужская обл",
		city: "Калуга",
		paymentStatus: "paid",
		paidAt: "2018-03-07T12:00:00+03:00",
	});
	// C: четвёртый заказ Анны, скидка промокодом 100 ₽ на заказ. 900 ₽ при позициях на 1000 ₽.
	await insertOrder(db, {
		key: "C",
		user: u1,
		status: "confirmed",
		at: "2018-03-20T12:00:00+03:00",
		total: 900,
		subtotal: 1000,
		discount: 100,
		items: [{ product: p1, qty: 2, unit: 500 }],
		region: "Калужская обл",
		city: "г Калуга",
		promo: "save10",
	});
	// D: Борис, ИП по 12-значному ИНН. Регион другого регистра — тот же регион.
	await insertOrder(db, {
		key: "D",
		user: u2,
		status: "shipped",
		at: "2018-03-10T12:00:00+03:00",
		total: 5000,
		items: [{ product: p2, qty: 5, unit: 1000 }],
		region: "калужская обл",
		city: "КАЛУГА",
		companyName: "ИП Борис",
		inn: "402700000012",
	});
	// E: Вера, юрлицо только по связи с организацией. Последние полчаса марта по Москве.
	await insertOrder(db, {
		key: "E",
		user: u3,
		status: "pending",
		at: "2018-03-31T23:30:00+03:00",
		total: 3000,
		items: [{ product: p1, qty: 3, unit: 1000 }],
		region: "Московская обл",
		city: "г Химки",
		companyId: Number(company.id),
	});
	// F: 00:10 первого апреля по Москве, в UTC это ещё март — в отчёт не входит.
	await insertOrder(db, {
		key: "F",
		user: u3,
		status: "delivered",
		at: "2018-04-01T00:10:00+03:00",
		total: 9999,
		items: [{ product: p1, qty: 9, unit: 1111 }],
	});
	// G: 00:10 первого марта по Москве, в UTC это ещё февраль — входит в март.
	await insertOrder(db, {
		key: "G",
		user: u4,
		status: "delivered",
		at: "2018-03-01T00:10:00+03:00",
		total: 600,
		items: [{ product: p2, qty: 1, unit: 600 }],
		delivery: "self_pickup",
		pickup: Number(pickup.id),
		payment: "self_pickup_cash",
	});
	// H: отмена покупателем с причиной. I: возврат, история пуста.
	await insertOrder(db, {
		key: "H",
		user: u5,
		status: "cancelled",
		at: "2018-03-12T12:00:00+03:00",
		total: 7000,
		items: [{ product: p1, qty: 7, unit: 1000 }],
		history: [
			{ status: "pending", at: "2018-03-12T12:00:00+03:00" },
			{
				status: "cancelled",
				at: "2018-03-12T15:00:00+03:00",
				comment: "Передумал",
			},
		],
	});
	await insertOrder(db, {
		key: "I",
		user: u5,
		status: "refunded",
		at: "2018-03-14T12:00:00+03:00",
		total: 4000,
		items: [{ product: p2, qty: 4, unit: 1000 }],
	});
	// J: обезличенный заказ без покупателя, адрес одной строкой — регион не угадывается.
	await insertOrder(db, {
		key: "J",
		user: null,
		status: "delivered",
		at: "2018-03-15T12:00:00+03:00",
		total: 1500,
		items: [{ product: p1, qty: 3, unit: 500 }],
		street: "Калужская обл, г Калуга, ул Ленина, 1",
	});

	const run = async <T>(queryString: string): Promise<T> =>
		(await buildSection(
			db,
			parseAnalyticsQuery(new URLSearchParams(queryString)),
		)) as T;

	const runProducts = async (queryString: string) => ({
		...(await run<ProductsDTO>(`section=products&${queryString}`)),
		ranking: (
			await run<ProductTableDTO>(`section=product_table&${queryString}`)
		).ranking,
	});

	const random = await seedRandom(db);

	return {
		ids: { u1, u2, u3, u4, u5, c1, c2, p1, p2, p3 },
		overview: await run(`section=overview&${MARCH}`),
		overviewWeek: await run(`section=overview&${MARCH}&granularity=week`),
		overviewYear: await run(`section=overview&${MARCH}&compare=year`),
		products: await runProducts(`${MARCH}&compare=none`),
		productsSearch: await runProducts(`${MARCH}&q=Товар%20Два`),
		productsCat2: await runProducts(`${MARCH}&category=${c2}`),
		productsAsc: await runProducts(`${MARCH}&sort=units&dir=asc`),
		geo: await run(`section=geo&${MARCH}`),
		customers: await run(`section=customers&${MARCH}`),
		funnel: await run(`section=funnel&${MARCH}`),
		meta: await run("section=meta"),
		legal: await run(`section=overview&${MARCH}&customerType=legal`),
		selfPickup: await run(`section=overview&${MARCH}&delivery=self_pickup`),
		regionKaluga: await run(
			`section=overview&${MARCH}&region=${encodeURIComponent("калужская обл")}`,
		),
		category2: await run(`section=overview&${MARCH}&category=${c2}`),
		statusCancelled: await run(`section=overview&${MARCH}&status=cancelled`),
		statusVoidProducts: await runProducts(`${MARCH}&status=void`),
		emptyPeriod: await run(
			"section=overview&period=custom&from=1999-01-01&to=1999-01-31",
		),
		emptyFunnel: await run(
			"section=funnel&period=custom&from=1999-01-01&to=1999-01-31",
		),
		emptyCustomers: await run(
			"section=customers&period=custom&from=1999-01-01&to=1999-01-31",
		),
		emptyProducts: await runProducts(
			"period=custom&from=1999-01-01&to=1999-01-31",
		),
		emptyGeo: await run(
			"section=geo&period=custom&from=1999-01-01&to=1999-01-31",
		),
		customersFiltered: await run(
			`section=customers&${MARCH}&region=${encodeURIComponent("калужская обл")}`,
		),
		random: {
			overview: await run(`section=overview&${random.query}`),
			customers: await run(`section=customers&${random.query}`),
			funnel: await run(`section=funnel&${random.query}`),
			products: await runProducts(random.query),
			page2: await run(`section=product_table&${random.query}&page=2`),
			pageOverflow: await run(`section=product_table&${random.query}&page=99`),
			expected: random.expected,
		},
	};
}

describe("аналитика заказов: расчёты", () => {
	let payload: Payload;
	let r: Results;

	before(async () => {
		payload = await getPayload({ config });
		try {
			await drizzleOf(payload).transaction(async (tx) => {
				r = await compute(tx);
				throw new Rollback();
			});
		} catch (error) {
			if (!(error instanceof Rollback)) throw error;
		}
	});

	after(async () => {
		await payload?.db?.destroy?.();
	});

	describe("общие показатели", () => {
		test("заказы, выручка и средний чек без отменённых", () => {
			const c = r.overview.current;
			assert.equal(c.placed, 8, "B C D E G H I J");
			assert.equal(c.orders, 6, "без H и I");
			assert.equal(c.cancelled, 1);
			assert.equal(c.refunded, 1);
			assert.equal(c.revenue, 2000 + 900 + 5000 + 3000 + 600 + 1500);
			assert.equal(c.lostRevenue, 7000 + 4000);
			assert.equal(c.avgCheck, 13000 / 6);
			assert.equal(c.voidRate, 2 / 8);
		});

		test("заказы, единицы и позиции не смешиваются и не задваиваются", () => {
			const c = r.overview.current;
			assert.equal(c.units, 3 + 2 + 5 + 3 + 1 + 3);
			assert.equal(c.positions, 7, "у заказа B две позиции");
			assert.equal(c.itemRevenue, 13100, "до скидки заказа C");
			// B с двумя позициями не должен удвоить сумму заказа.
			assert.equal(c.revenue, 13000);
		});

		test("статусы выполнения и оплаты", () => {
			const c = r.overview.current;
			assert.equal(c.delivered, 3);
			assert.equal(c.deliveredRevenue, 2000 + 600 + 1500);
			assert.equal(c.open, 3);
			assert.equal(c.openRevenue, 900 + 5000 + 3000);
			assert.equal(c.paid, 1);
			assert.equal(c.paidRevenue, 2000);
		});

		test("медиана чека", () => {
			// 600 900 1500 2000 3000 5000 → (1500+2000)/2
			assert.equal(r.overview.current.medianCheck, 1750);
		});

		test("границы периода считаются в поясе магазина", () => {
			const statuses = r.overview.statuses;
			const delivered = statuses.find((s) => s.status === "delivered");
			assert.equal(delivered?.orders, 3, "F (1 апреля) не вошёл, G вошёл");
			// G — четверг 1 марта 2018, ноль часов по Москве.
			assert.equal(r.overview.heatmap[3][0], 1);
		});

		test("сравнение с предыдущим периодом той же длины", () => {
			const { period, previous } = r.overview;
			assert.deepEqual(period.compare, {
				from: "2018-01-29",
				to: "2018-02-28",
			});
			assert.equal(previous?.placed, 1, "только февральский заказ");
			assert.equal(previous?.revenue, 1000);
		});

		test("сравнение с прошлым годом: данных нет — нули, а не выдумка", () => {
			assert.deepEqual(r.overviewYear.period.compare, {
				from: "2017-03-01",
				to: "2017-03-31",
			});
			assert.equal(r.overviewYear.previous?.avgCheck, null);
		});

		test("динамика сходится с итогом и не имеет дыр", () => {
			const { series, current } = r.overview;
			assert.equal(series.length, 31);
			assert.equal(
				series.reduce((s, p) => s + p.orders, 0),
				current.orders,
			);
			assert.equal(
				series.reduce((s, p) => s + p.revenue, 0),
				current.revenue,
			);
			assert.equal(
				series.reduce((s, p) => s + p.units, 0),
				current.units,
			);
			assert.equal(
				series.reduce((s, p) => s + p.placed, 0),
				current.placed,
			);
			assert.equal(series[0].start, "2018-03-01");
			assert.equal(series[0].orders, 1, "G попал в первый день");
			assert.equal(series[30].orders, 1, "E попал в последний день");
			assert.ok(series.every((p) => !p.partial));
		});

		test("неделя: неполные края отмечены, сумма та же", () => {
			const { series, current } = r.overviewWeek;
			assert.equal(series[0].start, "2018-02-26", "неделя с понедельника");
			assert.equal(series[0].partial, true);
			assert.equal(series.at(-1)?.partial, true);
			assert.equal(
				series.reduce((s, p) => s + p.revenue, 0),
				current.revenue,
			);
		});

		test("статусы и срезы сходятся с итогом", () => {
			const { statuses, delivery, payment, source, current } = r.overview;
			assert.equal(
				statuses.reduce((s, row) => s + row.orders, 0),
				current.placed,
			);
			for (const mix of [delivery, payment, source]) {
				assert.equal(
					mix.reduce((s, row) => s + row.orders, 0),
					current.orders,
				);
				assert.equal(
					mix.reduce((s, row) => s + row.revenue, 0),
					current.revenue,
				);
			}
		});

		test("промокоды регистронезависимы", () => {
			assert.equal(r.overview.promo.orders, 1);
			assert.equal(r.overview.promo.top[0].code, "SAVE10");
			assert.equal(r.overview.promo.revenue, 900);
		});

		test("скидка считается от суммы до скидок", () => {
			const c = r.overview.current;
			assert.equal(c.discount, 100);
			assert.equal(c.subtotal, 13100);
			assert.equal(c.discountRate, 100 / 13100);
		});
	});

	describe("фильтры", () => {
		test("тип покупателя определяется по связи с организацией", () => {
			assert.equal(r.legal.current.orders, 1, "только E");
			assert.equal(r.legal.current.revenue, 3000);
		});

		test("способ доставки", () => {
			assert.equal(r.selfPickup.current.placed, 1);
			assert.equal(r.selfPickup.current.revenue, 600);
		});

		test("регион регистронезависим", () => {
			assert.equal(r.regionKaluga.current.orders, 3, "B C D");
			assert.equal(r.regionKaluga.current.revenue, 7900);
		});

		test("категория: заказы целиком, единицы — только её товары", () => {
			// Заказы с товаром p2 в марте: B D G + отменённый I.
			assert.equal(r.category2.current.placed, 4);
			assert.equal(r.category2.current.orders, 3);
			assert.equal(r.category2.current.revenue, 2000 + 5000 + 600);
			// B содержит и p1, но считаем только p2: 1 + 5 + 1.
			assert.equal(r.category2.current.units, 7);
			assert.equal(r.category2.current.itemRevenue, 1000 + 5000 + 600);
		});

		test("статус «отменён»: заказ виден, но выручки не приносит", () => {
			assert.equal(r.statusCancelled.current.placed, 1);
			assert.equal(r.statusCancelled.current.orders, 0);
			assert.equal(r.statusCancelled.current.revenue, 0);
			assert.equal(r.statusCancelled.current.lostRevenue, 7000);
			assert.equal(r.statusCancelled.current.avgCheck, null);
		});
	});

	describe("товары", () => {
		const row = (dto: ProductsWithTable, id: number) =>
			dto.ranking.rows.find((p) => p.productId === id);

		test("единицы, выручка, заказы и покупатели товара", () => {
			const p1 = row(r.products, r.ids.p1);
			// B2 + C2 + E3 + J3 / 1000 + 1000 + 3000 + 1500
			assert.equal(p1?.units, 10);
			assert.equal(p1?.revenue, 6500);
			assert.equal(p1?.orders, 4);
			assert.equal(p1?.customers, 2, "Анна и Вера, J без покупателя");
			assert.equal(p1?.voidUnits, 7, "отменённый H");
			const p2 = row(r.products, r.ids.p2);
			assert.equal(p2?.units, 7);
			assert.equal(p2?.revenue, 6600);
			assert.equal(p2?.orders, 3);
			assert.equal(p2?.voidUnits, 4, "возврат I");
		});

		test("сверка: сумма позиций минус скидки заказа даёт выручку заказов", () => {
			const { summary } = r.products;
			assert.equal(summary.revenue, 13100);
			assert.equal(summary.orderRevenue, 13000);
			assert.equal(summary.orderDiscounts, 100);
			assert.equal(summary.units, 17);
			assert.equal(summary.soldProducts, 2);
		});

		test("рейтинг отсортирован, доли дают единицу, ABC считается", () => {
			const rows = r.products.ranking.rows;
			assert.equal(rows[0].productId, r.ids.p2, "6600 > 6500");
			assert.ok(
				Math.abs(rows.reduce((s, p) => s + (p.share ?? 0), 0) - 1) < 1e-9,
			);
			assert.equal(rows[0].abc, "A");
			assert.equal(rows[1].abc, "A", "до него накоплено 50%");
			const { abc } = r.products.summary;
			assert.equal(abc.A.products + abc.B.products + abc.C.products, 2);
		});

		test("топ по единицам и выручке различаются правилом сортировки", () => {
			assert.equal(r.products.topByRevenue[0].productId, r.ids.p2);
			assert.equal(r.products.topByUnits[0].productId, r.ids.p1);
			assert.equal(r.products.lowDemand[0].productId, r.ids.p2);
		});

		test("поиск и сортировка таблицы — на сервере, ABC не меняется", () => {
			assert.equal(r.productsSearch.ranking.total, 1);
			assert.equal(r.productsSearch.ranking.rows[0].productId, r.ids.p2);
			assert.equal(r.productsSearch.ranking.rows[0].abc, "A");
			assert.equal(r.productsAsc.ranking.rows[0].productId, r.ids.p2);
		});

		test("фильтр по категории ограничивает позиции и сверка всё равно сходится", () => {
			assert.equal(r.productsCat2.ranking.total, 1);
			assert.equal(r.productsCat2.summary.units, 7);
			// Сверка — по всем позициям заказов раздела (B, D, G): 7600.
			assert.equal(r.productsCat2.summary.orderRevenue, 7600);
			assert.equal(r.productsCat2.summary.orderDiscounts, 0);
		});

		test("товар без продаж виден, проданный — нет", () => {
			const ids = r.products.zeroSales.map((z) => z.productId);
			assert.ok(ids.includes(r.ids.p3));
			assert.ok(!ids.includes(r.ids.p1));
			assert.ok(r.products.summary.zeroSales >= 1);
		});

		test("категории и производители: доли сходятся с товарной выручкой", () => {
			const sum = r.products.categories.reduce((s, c) => s + c.revenue, 0);
			assert.equal(sum, 13100);
			assert.equal(r.products.manufacturers[0].label, "Завод");
			assert.equal(r.products.manufacturers[0].units, 17);
		});

		test("состав заказа и ценовые сегменты сходятся с итогами", () => {
			const { basketSizes, priceBands } = r.products;
			assert.equal(
				basketSizes.reduce((s, b) => s + b.orders, 0),
				6,
			);
			assert.equal(basketSizes[0].orders, 5, "одна позиция");
			assert.equal(basketSizes[1].orders, 1, "заказ B");
			assert.equal(
				priceBands.reduce((s, b) => s + b.units, 0),
				17,
			);
			assert.equal(
				priceBands.reduce((s, b) => s + b.revenue, 0),
				13100,
			);
		});

		test("часто покупают вместе: пара считается один раз", () => {
			assert.equal(r.products.pairs.length, 1);
			assert.equal(r.products.pairs[0].orders, 1, "только заказ B");
		});

		test("только отменённые заказы: товарных продаж нет", () => {
			assert.equal(r.statusVoidProducts.summary.units, 0);
			assert.equal(r.statusVoidProducts.ranking.total, 0);
		});
	});

	describe("география", () => {
		test("регионы склеиваются без учёта регистра", () => {
			const kaluga = r.geo.regions.rows.find(
				(row) => row.key === "калужская обл",
			);
			assert.equal(kaluga?.orders, 3);
			assert.equal(kaluga?.revenue, 7900);
			assert.equal(kaluga?.customers, 2);
			assert.equal(kaluga?.avgCheck, 7900 / 3);
		});

		test("самовывоз и пустой адрес — отдельно, адрес из street не угадывается", () => {
			const pickup = r.geo.regions.rows.find((row) => row.key === "__pickup");
			const unknown = r.geo.regions.rows.find((row) => row.key === "__unknown");
			assert.equal(pickup?.orders, 1);
			assert.equal(unknown?.orders, 1, "заказ J");
			assert.equal(r.geo.coverage.withRegion, 4);
			assert.equal(r.geo.coverage.pickup, 1);
			assert.equal(r.geo.coverage.unknownRegion, 1);
		});

		test("регионы сходятся с итогом", () => {
			assert.equal(
				r.geo.regions.rows.reduce((s, row) => s + row.orders, 0),
				r.geo.totals.orders,
			);
			assert.equal(
				r.geo.regions.rows.reduce((s, row) => s + row.revenue, 0),
				r.geo.totals.revenue,
			);
			assert.equal(r.geo.totals.orders, 6);
		});

		test("«г Калуга», «Калуга» и «КАЛУГА» — один город", () => {
			const kaluga = r.geo.cities.rows.find((row) => row.key === "калуга");
			assert.equal(kaluga?.orders, 3);
			const khimki = r.geo.cities.rows.find((row) => row.key === "химки");
			assert.equal(khimki?.label, "Химки");
			assert.equal(r.geo.cities.total, 2);
		});

		test("лидеры — только настоящие регионы", () => {
			assert.equal(r.geo.leaders.byOrders?.key, "калужская обл");
			assert.equal(r.geo.leaders.byRevenue?.key, "калужская обл");
		});

		test("пункты самовывоза", () => {
			assert.equal(r.geo.pickupPoints[0].label, "Склад Калуга");
			assert.equal(r.geo.pickupPoints[0].orders, 1);
		});
	});

	describe("клиенты", () => {
		test("уникальные, новые и вернувшиеся", () => {
			const c = r.customers.current;
			assert.equal(
				c.customers,
				4,
				"Анна Борис Вера Глеб; у Дины только отмены",
			);
			assert.equal(c.newCustomers, 3);
			assert.equal(c.returningCustomers, 1, "Анна");
			assert.equal(c.customers, c.newCustomers + c.returningCustomers);
		});

		test("повторные заказы определяются на уровне клиента", () => {
			const c = r.customers.current;
			assert.equal(c.repeatOrders, 2, "третий и четвёртый заказы Анны");
			assert.equal(c.firstOrders, 3, "D E G");
			assert.equal(c.repeatOrderShare, 2 / 5);
			assert.equal(c.repeatCustomers, 1);
			assert.equal(c.repeatRate, 1 / 4);
			assert.equal(c.repeatWithinPeriod, 1);
			assert.equal(c.ordersPerCustomer, 5 / 4);
			assert.equal(c.firstOrderRevenue, 5000 + 3000 + 600);
			assert.equal(c.repeatOrderRevenue, 2000 + 900);
		});

		test("заказ без покупателя не приписан никому и показан отдельно", () => {
			const c = r.customers.current;
			assert.equal(c.unattributedOrders, 1);
			assert.equal(c.unattributedRevenue, 1500);
		});

		test("интервал между покупками — по всей истории клиента", () => {
			const c = r.customers.current;
			// Только у Анны: 10.02→05.03 = 23 дня и 05.03→20.03 = 15 дней.
			assert.equal(c.daysBetweenSample, 2);
			assert.equal(c.medianDaysBetweenOrders, 19);
		});

		test("типы: клиент один раз, заказы и деньги сходятся с итогом", () => {
			const { types } = r.customers;
			const by = Object.fromEntries(types.map((t) => [t.type, t]));
			assert.equal(by.individual.customers, 2, "Анна и Глеб");
			assert.equal(by.individual.orders, 4, "B C G и обезличенный J");
			assert.equal(by.sole_proprietor.customers, 1);
			assert.equal(by.sole_proprietor.revenue, 5000);
			assert.equal(by.legal.customers, 1);
			assert.equal(
				types.reduce((s, t) => s + t.customers, 0),
				r.customers.current.customers,
			);
			assert.equal(
				types.reduce((s, t) => s + t.orders, 0),
				6,
			);
			assert.equal(r.customers.mixedTypeCustomers, 0);
		});

		test("частота покупок", () => {
			const { frequency } = r.customers;
			assert.equal(frequency.find((f) => f.key === "1")?.customers, 3);
			assert.equal(frequency.find((f) => f.key === "2")?.customers, 1);
			assert.equal(
				frequency.reduce((s, f) => s + f.customers, 0),
				4,
			);
		});

		test("фильтр не делает старого клиента новым", () => {
			// В Калужской области заказы Анны и Бориса. Анна покупала раньше —
			// первый заказ вне фильтра всё равно считается.
			const c = r.customersFiltered.current;
			assert.equal(c.customers, 2);
			assert.equal(c.newCustomers, 1, "только Борис");
			assert.equal(c.repeatOrders, 2);
		});

		test("когорты: месяц первой покупки и возвраты", () => {
			const { cohorts } = r.customers;
			const january = cohorts.rows.find((row) => row.cohort === "2018-01-01");
			assert.equal(january?.size, 1, "Анна");
			assert.equal(january?.retention[0], 1);
			assert.equal(january?.retention[1], 1, "февраль");
			assert.equal(january?.retention[2], 1, "март");
			assert.equal(january?.retention[3], null, "апрель ещё не наступил");
			const march = cohorts.rows.find((row) => row.cohort === "2018-03-01");
			assert.equal(march?.size, 3, "Борис Вера Глеб");
		});

		test("топ клиентов", () => {
			const top = r.customers.topCustomers;
			assert.equal(top[0].userId, r.ids.u2);
			assert.equal(top[0].revenue, 5000);
			assert.equal(top[0].company, "ИП Борис");
			const anna = top.find((t) => t.userId === r.ids.u1);
			assert.equal(anna?.orders, 2);
			assert.equal(anna?.lifetimeOrders, 4);
		});
	});

	describe("воронка", () => {
		test("этапы накопительные, конверсия считается", () => {
			const { stages, placed } = r.funnel;
			assert.equal(placed, 8);
			assert.deepEqual(
				stages.map((s) => s.reached),
				[8, 5, 4, 4, 3],
			);
			assert.equal(stages[0].conversionToNext, 5 / 8);
			assert.equal(stages[3].conversionToNext, 3 / 4);
			assert.equal(stages[4].conversionToNext, null);
		});

		test("очередь и потери разделены", () => {
			const { stages } = r.funnel;
			assert.deepEqual(
				stages.map((s) => s.active),
				[1, 1, 0, 1, 0],
				"E C D",
			);
			assert.deepEqual(
				stages.map((s) => s.lost),
				[2, 0, 0, 0, 0],
				"H и I",
			);
			assert.equal(stages[0].lostAmount, 11000);
			// Убыль этапа = стоят на нём + потеряны на нём.
			for (let i = 0; i < stages.length - 1; i++) {
				assert.equal(
					stages[i].reached - stages[i + 1].reached,
					stages[i].active + stages[i].lost,
				);
			}
		});

		test("конверсия без учёта незавершённых не штрафует свежие заказы", () => {
			// Первый этап: 8 достигли, E ещё ждёт → 5 из 7 решённых.
			assert.equal(r.funnel.stages[0].closedConversionToNext, 5 / 7);
		});

		test("самые большие потери и очередь", () => {
			assert.equal(r.funnel.biggestLossStage, "Оформлен");
			assert.ok(r.funnel.biggestQueueStage);
		});

		test("отмены и причины", () => {
			const v = r.funnel.void;
			assert.equal(v.cancelled, 1);
			assert.equal(v.refunded, 1);
			assert.equal(v.cancelledAmount, 7000);
			assert.equal(v.refundedAmount, 4000);
			assert.equal(v.rate, 2 / 8);
			assert.equal(v.previousRate, 0);
			assert.deepEqual(v.reasons, [{ reason: "Передумал", orders: 1 }]);
		});

		test("покрытие историей статусов показано честно", () => {
			assert.equal(r.funnel.historyCoverage.withTransitions, 1, "только H");
			assert.equal(r.funnel.historyCoverage.total, 8);
		});

		test("оплата по способам", () => {
			const invoice = r.funnel.payment.find((p) => p.method === "invoice");
			assert.equal(invoice?.orders, 5, "B C D E J");
			assert.equal(invoice?.paid, 1);
			assert.equal(invoice?.paidRate, 1 / 5);
			assert.equal(invoice?.medianDaysToPay, 2);
			assert.equal(invoice?.daysToPaySample, 1);
		});

		test("срезы отмен покрывают все заказы по каждому измерению", () => {
			for (const dimension of ["delivery", "payment", "customerType"]) {
				const rows = r.funnel.void.slices.filter(
					(s) => s.dimension === dimension,
				);
				assert.equal(
					rows.reduce((s, row) => s + row.placed, 0),
					8,
				);
				assert.equal(
					rows.reduce((s, row) => s + row.voided, 0),
					2,
				);
			}
		});
	});

	describe("пустой период", () => {
		test("нули и null вместо деления на ноль", () => {
			const c = r.emptyPeriod.current;
			assert.equal(c.placed, 0);
			assert.equal(c.revenue, 0);
			assert.equal(c.avgCheck, null);
			assert.equal(c.medianCheck, null);
			assert.equal(c.voidRate, null);
			assert.equal(c.discountRate, null);
			assert.equal(r.emptyPeriod.series.length, 31);
		});

		test("остальные разделы не падают", () => {
			assert.equal(r.emptyFunnel.placed, 0);
			assert.equal(r.emptyFunnel.stages[0].conversionToNext, null);
			assert.equal(r.emptyFunnel.biggestLossStage, null);
			assert.equal(r.emptyCustomers.current.customers, 0);
			assert.equal(r.emptyCustomers.current.repeatRate, null);
			assert.equal(r.emptyProducts.ranking.total, 0);
			assert.equal(r.emptyProducts.summary.top10Share, null);
			assert.equal(r.emptyGeo.leaders.byOrders, null);
		});
	});

	describe("справочники", () => {
		test("категории и регионы для фильтров", () => {
			assert.ok(r.meta.categories.some((c) => c.id === r.ids.c1));
			assert.ok(r.meta.regions.some((row) => row.key === "калужская обл"));
			assert.ok(r.meta.regions.some((row) => row.label === "Самовывоз"));
			assert.ok(r.meta.totalOrders >= 12);
		});
	});

	describe("случайный набор: SQL против независимого расчёта на JS", () => {
		test("общие показатели", () => {
			const { overview, expected: e } = r.random;
			assert.equal(overview.current.placed, e.placed);
			assert.equal(overview.current.orders, e.orders);
			assert.equal(overview.current.revenue, e.revenue);
			assert.equal(overview.current.lostRevenue, e.lost);
			assert.equal(overview.current.units, e.units);
			assert.equal(overview.current.positions, e.positions);
			assert.equal(overview.current.customers, e.customers);
		});

		test("клиенты", () => {
			const { customers, expected: e } = r.random;
			assert.equal(customers.current.customers, e.customers);
			assert.equal(customers.current.newCustomers, e.newCustomers);
			assert.equal(customers.current.repeatOrders, e.repeatOrders);
			assert.equal(customers.current.firstOrders, e.firstOrders);
			assert.equal(customers.current.repeatCustomers, e.repeatCustomers);
		});

		test("воронка", () => {
			const { funnel, expected: e } = r.random;
			assert.deepEqual(
				funnel.stages.map((s) => s.reached),
				e.reached,
			);
			assert.equal(funnel.stages[0].lost, e.lost0);
		});

		test("товары", () => {
			const { products, page2, expected: e } = r.random;
			assert.equal(products.ranking.total, e.productUnits.size);
			for (const row of [...products.ranking.rows, ...page2.ranking.rows]) {
				assert.equal(row.units, e.productUnits.get(row.productId));
				assert.equal(row.revenue, e.productRevenue.get(row.productId));
				assert.equal(row.orders, e.productOrders.get(row.productId));
			}
		});

		test("страницы рейтинга не теряют и не повторяют товары", () => {
			const { products, page2, expected: e } = r.random;
			assert.ok(e.productUnits.size > 25, "набор больше одной страницы");
			assert.equal(products.ranking.rows.length, 25);
			const ids = [...products.ranking.rows, ...page2.ranking.rows].map(
				(row) => row.productId,
			);
			assert.equal(new Set(ids).size, e.productUnits.size);
			const revenue = [...products.ranking.rows, ...page2.ranking.rows].map(
				(row) => row.revenue,
			);
			assert.deepEqual(
				revenue,
				[...revenue].sort((a, b) => b - a),
			);
			assert.equal(page2.ranking.page, 2);
		});

		test("номер страницы за концом списка — последняя страница", () => {
			const { pageOverflow, page2 } = r.random;
			assert.equal(pageOverflow.ranking.page, 2);
			assert.deepEqual(
				pageOverflow.ranking.rows.map((row) => row.productId),
				page2.ranking.rows.map((row) => row.productId),
			);
		});
	});
});
