import { sql } from "@payloadcms/db-postgres";
import { PRODUCT_STILL_ON_SALE } from "../../../payload/services/review-eligibility.ts";
import {
	type Executor,
	num,
	numOrNull,
	query,
	queryOne,
	type Row,
	type SQL,
	str,
} from "../../support-chat/server/db.ts";
import {
	ABC_A_SHARE,
	ABC_B_SHARE,
	PRODUCT_PAGE_SIZE,
} from "../lib/constants.ts";
import type {
	AnalyticsFilters,
	DateRange,
	ProductTableQuery,
} from "../lib/query.ts";
import type {
	BandRow,
	DemandRow,
	PeriodInfo,
	ProductRow,
	ProductsDTO,
	ProductTableDTO,
} from "../lib/types.ts";
import { ratio } from "./overview.ts";
import { itemCategoryFilter, scopedOrders } from "./scope.ts";

/**
 * Товарная аналитика считается по снимкам позиций заказа (orders_items): цена и
 * количество там зафиксированы на момент покупки и не плывут вместе с каталогом.
 *
 * Выручка позиции — total_price: уже со скидкой товара, но ДО скидки корзины и
 * промокода, которые относятся к заказу целиком. Делить их между позициями
 * значило бы приписать товарам суммы, которых в данных нет, поэтому разница
 * показывается отдельной строкой сверки (`summary.orderDiscounts`).
 *
 * Заказ с товарами двух категорий входит в заказы обеих — доли поэтому
 * считаются только по единицам и выручке, которые не задваиваются.
 */

const RANKING_ORDER: Record<ProductTableQuery["sort"], SQL> = {
	revenue: sql`r.revenue`,
	units: sql`r.units`,
	orders: sql`r.orders`,
	customers: sql`r.customers`,
	avgPrice: sql`r.revenue / NULLIF(r.units, 0)`,
	voidUnits: sql`r.void_units`,
};

/** Покупки товаров в отчёте — по строке на товар. */
function productAggregates(filters: AnalyticsFilters, range: DateRange): SQL {
	return sql`(
		SELECT
			i.product_id,
			MAX(i.name) AS snapshot_title,
			COALESCE(SUM(i.quantity) FILTER (WHERE NOT o.is_void), 0) AS units,
			COALESCE(SUM(i.total_price) FILTER (WHERE NOT o.is_void), 0) AS revenue,
			COUNT(DISTINCT o.id) FILTER (WHERE NOT o.is_void) AS orders,
			COUNT(DISTINCT o.user_id) FILTER (WHERE NOT o.is_void) AS customers,
			COALESCE(SUM(i.quantity) FILTER (WHERE o.is_void), 0) AS void_units
		FROM ${scopedOrders(filters, range)} o
		JOIN orders_items i ON i._parent_id = o.id
		LEFT JOIN products p ON p.id = i.product_id
		WHERE ${itemCategoryFilter(filters)}
		GROUP BY i.product_id
	)`;
}

/**
 * Рейтинг: класс ABC и доля считаются по всему набору ДО поиска и страниц —
 * искать товар и видеть другой класс было бы ошибкой.
 */
function rankedProducts(
	filters: AnalyticsFilters,
	range: DateRange,
	compare: DateRange | null,
): SQL {
	const prevJoin = compare
		? sql`LEFT JOIN ${productAggregates(filters, compare)} prev ON prev.product_id = a.product_id`
		: sql`LEFT JOIN (SELECT NULL::int AS product_id, NULL::numeric AS units, NULL::numeric AS revenue) prev ON FALSE`;
	return sql`(
		SELECT
			a.*,
			${compare ? sql`COALESCE(prev.units, 0)` : sql`NULL::numeric`} AS prev_units,
			${compare ? sql`COALESCE(prev.revenue, 0)` : sql`NULL::numeric`} AS prev_revenue,
			a.revenue / NULLIF(SUM(a.revenue) OVER (), 0) AS share,
			(SUM(a.revenue) OVER (ORDER BY a.revenue DESC, a.product_id) - a.revenue)
				/ NULLIF(SUM(a.revenue) OVER (), 0) AS share_before,
			COALESCE(pl.title, a.snapshot_title) AS title,
			pr.category_id,
			cl.name AS category,
			pr.inventory_status::text AS inventory_status
		FROM ${productAggregates(filters, range)} a
		${prevJoin}
		LEFT JOIN products pr ON pr.id = a.product_id
		LEFT JOIN products_locales pl ON pl._parent_id = a.product_id AND pl._locale = 'ru'
		LEFT JOIN categories_locales cl ON cl._parent_id = pr.category_id AND cl._locale = 'ru'
		WHERE a.units > 0
	)`;
}

function abcClass(shareBefore: number): "A" | "B" | "C" {
	if (shareBefore < ABC_A_SHARE) return "A";
	return shareBefore < ABC_B_SHARE ? "B" : "C";
}

function toProductRow(row: Row): ProductRow {
	const units = num(row.units);
	const revenue = num(row.revenue);
	return {
		productId: num(row.product_id),
		title: str(row.title) ?? "",
		categoryId: numOrNull(row.category_id),
		category: str(row.category),
		inventoryStatus: str(row.inventory_status),
		units,
		revenue,
		orders: num(row.orders),
		customers: num(row.customers),
		avgPrice: ratio(revenue, units),
		share: numOrNull(row.share),
		// Вся выручка нулевая (бесплатные позиции) — вклада нет, класс C.
		abc: row.share_before === null ? "C" : abcClass(num(row.share_before)),
		voidUnits: num(row.void_units),
		prevUnits: numOrNull(row.prev_units),
		prevRevenue: numOrNull(row.prev_revenue),
	};
}

async function fetchDemand(
	db: Executor,
	filters: AnalyticsFilters,
	period: PeriodInfo,
	dimension: "category" | "manufacturer",
): Promise<DemandRow[]> {
	const keyExpr =
		dimension === "category"
			? sql`COALESCE(cl.name, 'Без категории')`
			: sql`COALESCE(NULLIF(trim(p.brand_manufacturer), ''), 'Производитель не указан')`;
	const idExpr =
		dimension === "category" ? sql`MAX(p.category_id)` : sql`NULL::int`;

	const aggregate = (range: DateRange) => sql`(
		SELECT
			${keyExpr} AS label,
			${idExpr} AS id,
			COUNT(DISTINCT i.product_id) AS products,
			SUM(i.quantity) AS units,
			SUM(i.total_price) AS revenue,
			COUNT(DISTINCT o.id) AS orders,
			COUNT(DISTINCT o.user_id) AS customers
		FROM ${scopedOrders(filters, range)} o
		JOIN orders_items i ON i._parent_id = o.id
		LEFT JOIN products p ON p.id = i.product_id
		LEFT JOIN categories_locales cl ON cl._parent_id = p.category_id AND cl._locale = 'ru'
		WHERE NOT o.is_void AND ${itemCategoryFilter(filters)}
		GROUP BY 1
	)`;

	const range = { from: period.from, to: period.to };
	const rows = await query(
		db,
		sql`SELECT a.*, ${
			period.compare ? sql`COALESCE(prev.revenue, 0)` : sql`NULL::numeric`
		} AS prev_revenue
		FROM ${aggregate(range)} a
		${
			period.compare
				? sql`LEFT JOIN ${aggregate(period.compare)} prev ON prev.label = a.label`
				: sql``
		}
		ORDER BY a.revenue DESC, a.label
		LIMIT 50`,
	);
	return rows.map((row) => ({
		key: String(row.label),
		label: String(row.label),
		id: numOrNull(row.id),
		products: num(row.products),
		units: num(row.units),
		revenue: num(row.revenue),
		orders: num(row.orders),
		customers: num(row.customers),
		prevRevenue: numOrNull(row.prev_revenue),
	}));
}

const PRICE_BANDS: { key: string; label: string; to: number | null }[] = [
	{ key: "lt1k", label: "до 1 000 ₽", to: 1_000 },
	{ key: "lt5k", label: "1 000 – 5 000 ₽", to: 5_000 },
	{ key: "lt10k", label: "5 000 – 10 000 ₽", to: 10_000 },
	{ key: "lt25k", label: "10 000 – 25 000 ₽", to: 25_000 },
	{ key: "lt50k", label: "25 000 – 50 000 ₽", to: 50_000 },
	{ key: "lt100k", label: "50 000 – 100 000 ₽", to: 100_000 },
	{ key: "gte100k", label: "от 100 000 ₽", to: null },
];

const BASKET_BANDS: { key: string; label: string; to: number | null }[] = [
	{ key: "1", label: "1 позиция", to: 1 },
	{ key: "2", label: "2 позиции", to: 2 },
	{ key: "3", label: "3 позиции", to: 3 },
	{ key: "4-5", label: "4–5 позиций", to: 5 },
	{ key: "6-10", label: "6–10 позиций", to: 10 },
	{ key: "11+", label: "11 и больше", to: null },
];

function bandIndexSql(
	bands: { to: number | null }[],
	column: SQL,
	inclusive: boolean,
): SQL {
	const whens = bands.flatMap((band, index) =>
		band.to === null
			? []
			: [
					inclusive
						? sql`WHEN ${column} <= ${sql.raw(String(band.to))} THEN ${sql.raw(String(index))}`
						: sql`WHEN ${column} < ${sql.raw(String(band.to))} THEN ${sql.raw(String(index))}`,
				],
	);
	return sql`CASE ${sql.join(whens, sql` `)} ELSE ${sql.raw(String(bands.length - 1))} END`;
}

function fillBands(
	bands: { key: string; label: string }[],
	rows: Row[],
): BandRow[] {
	const byIndex = new Map(rows.map((row) => [num(row.band), row]));
	return bands.map((band, index) => {
		const row = byIndex.get(index);
		return {
			key: band.key,
			label: band.label,
			orders: num(row?.orders),
			units: num(row?.units),
			revenue: num(row?.revenue),
		};
	});
}

export async function buildProductTable(
	db: Executor,
	filters: AnalyticsFilters,
	period: PeriodInfo,
	table: ProductTableQuery,
): Promise<ProductTableDTO> {
	const ranked = rankedProducts(
		filters,
		{ from: period.from, to: period.to },
		period.compare,
	);
	const search = table.search
		? sql`WHERE r.title ILIKE ${`%${table.search.replace(/[\\%_]/g, "\\$&")}%`}`
		: sql``;
	const counted = await queryOne(
		db,
		sql`SELECT COUNT(*) AS total FROM ${ranked} r ${search}`,
	);
	const total = num(counted?.total);
	// Старая ссылка с номером страницы за концом списка — последняя страница,
	// а не пустая таблица, которая читалась бы как «продаж нет».
	const lastPage = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));
	const page = Math.min(table.page, lastPage);
	const direction = sql.raw(table.dir === "asc" ? "ASC" : "DESC");
	const rows = await query(
		db,
		sql`SELECT r.*
		FROM ${ranked} r
		${search}
		ORDER BY ${RANKING_ORDER[table.sort]} ${direction} NULLS LAST, r.product_id
		LIMIT ${PRODUCT_PAGE_SIZE} OFFSET ${(page - 1) * PRODUCT_PAGE_SIZE}`,
	);
	return {
		section: "product_table",
		period,
		ranking: {
			rows: rows.map(toProductRow),
			total,
			page,
			pageSize: PRODUCT_PAGE_SIZE,
		},
	};
}

export async function buildProducts(
	db: Executor,
	filters: AnalyticsFilters,
	period: PeriodInfo,
): Promise<ProductsDTO> {
	const range: DateRange = { from: period.from, to: period.to };
	const scope = scopedOrders(filters, range);
	const ranked = rankedProducts(filters, range, period.compare);
	const itemFilter = itemCategoryFilter(filters);

	const listBy = async (order: SQL, limit: number) =>
		(
			await query(
				db,
				sql`SELECT r.* FROM ${ranked} r ORDER BY ${order}, r.product_id LIMIT ${limit}`,
			)
		).map(toProductRow);

	const summary = await queryOne(
		db,
		sql`WITH r AS (SELECT * FROM ${ranked} r)
		SELECT
			COUNT(*) AS sold_products,
			COALESCE(SUM(units), 0) AS units,
			COALESCE(SUM(revenue), 0) AS revenue,
			COUNT(*) FILTER (WHERE share_before < ${ABC_A_SHARE}) AS a_products,
			COALESCE(SUM(revenue) FILTER (WHERE share_before < ${ABC_A_SHARE}), 0) AS a_revenue,
			COUNT(*) FILTER (WHERE share_before >= ${ABC_A_SHARE} AND share_before < ${ABC_B_SHARE}) AS b_products,
			COALESCE(SUM(revenue) FILTER (WHERE share_before >= ${ABC_A_SHARE} AND share_before < ${ABC_B_SHARE}), 0) AS b_revenue,
			COUNT(*) FILTER (WHERE share_before >= ${ABC_B_SHARE} OR share_before IS NULL) AS c_products,
			COALESCE(SUM(revenue) FILTER (WHERE share_before >= ${ABC_B_SHARE} OR share_before IS NULL), 0) AS c_revenue,
			(SELECT SUM(t.revenue) FROM (SELECT revenue FROM r ORDER BY revenue DESC, product_id LIMIT 10) t)
				/ NULLIF(SUM(revenue), 0) AS top10_share
		FROM r`,
	);

	const previousSummary = period.compare
		? await queryOne(
				db,
				sql`SELECT
					COUNT(*) FILTER (WHERE a.units > 0) AS sold_products,
					COALESCE(SUM(a.units), 0) AS units,
					COALESCE(SUM(a.revenue), 0) AS revenue
				FROM ${productAggregates(filters, period.compare)} a`,
			)
		: null;

	const orderMoney = await queryOne(
		db,
		sql`SELECT COALESCE(SUM(o.total), 0) AS revenue,
			COALESCE(SUM(o.subtotal - o.total), 0) AS gap
		FROM ${scope} o WHERE NOT o.is_void`,
	);
	const itemGross = await queryOne(
		db,
		sql`SELECT COALESCE(SUM(i.total_price), 0) AS item_revenue
		FROM ${scope} o
		JOIN orders_items i ON i._parent_id = o.id
		WHERE NOT o.is_void`,
	);

	const catalogCategory =
		filters.categoryId === null
			? sql`TRUE`
			: sql`p.category_id = ${filters.categoryId}`;
	const zeroWhere = sql`${PRODUCT_STILL_ON_SALE} AND ${catalogCategory}
		AND NOT EXISTS (
			SELECT 1 FROM ${scope} zo
			JOIN orders_items zi ON zi._parent_id = zo.id
			WHERE zi.product_id = p.id AND NOT zo.is_void
		)`;
	const catalog = await queryOne(
		db,
		sql`SELECT
			(SELECT COUNT(*) FROM products p WHERE ${PRODUCT_STILL_ON_SALE} AND ${catalogCategory}) AS active,
			(SELECT COUNT(*) FROM products p WHERE ${zeroWhere}) AS zero_sales`,
	);
	const zeroRows = await query(
		db,
		sql`SELECT p.id, pl.title, cl.name AS category, COALESCE(p.analytics_views_count, 0) AS views
		FROM products p
		LEFT JOIN products_locales pl ON pl._parent_id = p.id AND pl._locale = 'ru'
		LEFT JOIN categories_locales cl ON cl._parent_id = p.category_id AND cl._locale = 'ru'
		WHERE ${zeroWhere}
		ORDER BY views DESC, p.id
		LIMIT 20`,
	);

	const priceRows = await query(
		db,
		sql`SELECT ${bandIndexSql(PRICE_BANDS, sql`i.unit_price`, false)} AS band,
			COUNT(DISTINCT o.id) AS orders,
			SUM(i.quantity) AS units,
			SUM(i.total_price) AS revenue
		FROM ${scope} o
		JOIN orders_items i ON i._parent_id = o.id
		LEFT JOIN products p ON p.id = i.product_id
		WHERE NOT o.is_void AND ${itemFilter}
		GROUP BY 1`,
	);

	const basketRows = await query(
		db,
		sql`WITH per_order AS (
			SELECT o.id, COUNT(i.id) AS positions, SUM(i.quantity) AS units, MAX(o.total) AS total
			FROM ${scope} o
			JOIN orders_items i ON i._parent_id = o.id
			WHERE NOT o.is_void
			GROUP BY o.id
		)
		SELECT ${bandIndexSql(BASKET_BANDS, sql`positions`, true)} AS band,
			COUNT(*) AS orders,
			SUM(units) AS units,
			SUM(total) AS revenue
		FROM per_order GROUP BY 1`,
	);

	const pairRows = await query(
		db,
		sql`WITH lines AS (
			SELECT DISTINCT o.id AS order_id, i.product_id
			FROM ${scope} o
			JOIN orders_items i ON i._parent_id = o.id
			LEFT JOIN products p ON p.id = i.product_id
			WHERE NOT o.is_void AND ${itemFilter}
		), pairs AS (
			SELECT a.product_id AS a_id, b.product_id AS b_id, COUNT(*) AS orders
			FROM lines a
			JOIN lines b ON a.order_id = b.order_id AND a.product_id < b.product_id
			GROUP BY 1, 2
			ORDER BY 3 DESC, 1, 2
			LIMIT 10
		)
		SELECT pa.title AS a, pb.title AS b, pairs.orders
		FROM pairs
		LEFT JOIN products_locales pa ON pa._parent_id = pairs.a_id AND pa._locale = 'ru'
		LEFT JOIN products_locales pb ON pb._parent_id = pairs.b_id AND pb._locale = 'ru'
		ORDER BY pairs.orders DESC, a, b`,
	);

	const interestRows = await query(
		db,
		sql`SELECT
			p.id,
			pl.title,
			COALESCE(p.analytics_views_count, 0) AS views,
			COALESCE(p.analytics_purchases_count, 0) AS purchases,
			(SELECT COUNT(*) FROM wishlists_items w WHERE w.product_id = p.id) AS wishlists,
			(SELECT COUNT(*) FROM restock_subscriptions rs WHERE rs.product_id = p.id) AS restock
		FROM products p
		LEFT JOIN products_locales pl ON pl._parent_id = p.id AND pl._locale = 'ru'
		WHERE ${catalogCategory}
		ORDER BY restock DESC, wishlists DESC, views DESC, p.id
		LIMIT 10`,
	);

	const soldProducts = num(summary?.sold_products);
	const orderRevenue = num(orderMoney?.revenue);

	return {
		section: "products",
		period,
		summary: {
			soldProducts,
			units: num(summary?.units),
			revenue: num(summary?.revenue),
			// Всегда по ВСЕМ позициям заказов: при фильтре по категории заказ
			// несёт и чужие товары, и сверка иначе не сойдётся.
			orderDiscounts: num(itemGross?.item_revenue) - orderRevenue,
			orderRevenue,
			activeCatalog: num(catalog?.active),
			zeroSales: num(catalog?.zero_sales),
			top10Share: numOrNull(summary?.top10_share),
			abc: {
				A: {
					products: num(summary?.a_products),
					revenue: num(summary?.a_revenue),
				},
				B: {
					products: num(summary?.b_products),
					revenue: num(summary?.b_revenue),
				},
				C: {
					products: num(summary?.c_products),
					revenue: num(summary?.c_revenue),
				},
			},
			prevUnits: previousSummary ? num(previousSummary.units) : null,
			prevRevenue: previousSummary ? num(previousSummary.revenue) : null,
			prevSoldProducts: previousSummary
				? num(previousSummary.sold_products)
				: null,
		},
		topByRevenue: await listBy(sql`r.revenue DESC`, 10),
		topByUnits: await listBy(sql`r.units DESC`, 10),
		lowDemand: await listBy(sql`r.units ASC, r.revenue ASC`, 10),
		zeroSales: zeroRows.map((row) => ({
			productId: num(row.id),
			title: str(row.title) ?? `Товар #${num(row.id)}`,
			category: str(row.category),
			views: num(row.views),
		})),
		categories: await fetchDemand(db, filters, period, "category"),
		manufacturers: await fetchDemand(db, filters, period, "manufacturer"),
		priceBands: fillBands(PRICE_BANDS, priceRows),
		basketSizes: fillBands(BASKET_BANDS, basketRows),
		pairs: pairRows.map((row) => ({
			a: str(row.a) ?? "",
			b: str(row.b) ?? "",
			orders: num(row.orders),
		})),
		interest: interestRows.map((row) => ({
			productId: num(row.id),
			title: str(row.title) ?? `Товар #${num(row.id)}`,
			views: num(row.views),
			purchases: num(row.purchases),
			wishlists: num(row.wishlists),
			restock: num(row.restock),
		})),
	};
}
