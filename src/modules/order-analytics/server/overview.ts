import { sql } from "@payloadcms/db-postgres";
import {
	type Executor,
	num,
	numOrNull,
	query,
	queryOne,
	type SQL,
	str,
} from "../../support-chat/server/db.ts";
import {
	type AnalyticsOrderStatus,
	type Granularity,
	ORDER_STATUSES,
} from "../lib/constants.ts";
import type { AnalyticsFilters, DateRange } from "../lib/query.ts";
import type {
	MixRow,
	OverviewDTO,
	PeriodInfo,
	SeriesPoint,
	Totals,
} from "../lib/types.ts";
import {
	bucketOf,
	itemCategoryFilter,
	localTime,
	scopedOrders,
} from "./scope.ts";

/** Отношение без деления на ноль: нет базы — нет и показателя, а не 0. */
export function ratio(part: number, whole: number): number | null {
	return whole > 0 ? part / whole : null;
}

/**
 * Позиции заказа сворачиваются до строки на заказ ДО соединения с ним:
 * иначе заказ с тремя позициями утроил бы свою сумму и счётчик заказов.
 */
function itemTotalsJoin(filters: AnalyticsFilters): SQL {
	return sql`LEFT JOIN LATERAL (
		SELECT
			SUM(i.quantity) AS units,
			COUNT(*) AS positions,
			SUM(i.total_price) AS item_revenue
		FROM orders_items i
		LEFT JOIN products p ON p.id = i.product_id
		WHERE i._parent_id = o.id AND ${itemCategoryFilter(filters)}
	) x ON TRUE`;
}

export async function fetchTotals(
	db: Executor,
	filters: AnalyticsFilters,
	range: DateRange,
): Promise<Totals> {
	const row = await queryOne(
		db,
		sql`SELECT
			COUNT(*) AS placed,
			COUNT(*) FILTER (WHERE NOT o.is_void) AS orders,
			COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled,
			COUNT(*) FILTER (WHERE o.status = 'refunded') AS refunded,
			COALESCE(SUM(o.total) FILTER (WHERE NOT o.is_void), 0) AS revenue,
			COALESCE(SUM(o.total) FILTER (WHERE o.is_void), 0) AS lost_revenue,
			percentile_cont(0.5) WITHIN GROUP (ORDER BY o.total)
				FILTER (WHERE NOT o.is_void) AS median_check,
			COUNT(*) FILTER (WHERE o.status = 'delivered') AS delivered,
			COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered'), 0) AS delivered_revenue,
			COUNT(*) FILTER (WHERE NOT o.is_void AND o.status <> 'delivered') AS open,
			COALESCE(SUM(o.total) FILTER (WHERE NOT o.is_void AND o.status <> 'delivered'), 0) AS open_revenue,
			COUNT(*) FILTER (WHERE NOT o.is_void AND o.payment_status = 'paid') AS paid,
			COALESCE(SUM(o.total) FILTER (WHERE NOT o.is_void AND o.payment_status = 'paid'), 0) AS paid_revenue,
			COALESCE(SUM(x.units) FILTER (WHERE NOT o.is_void), 0) AS units,
			COALESCE(SUM(x.positions) FILTER (WHERE NOT o.is_void), 0) AS positions,
			COALESCE(SUM(x.item_revenue) FILTER (WHERE NOT o.is_void), 0) AS item_revenue,
			COUNT(DISTINCT o.user_id) FILTER (WHERE NOT o.is_void) AS customers,
			COALESCE(SUM(o.subtotal) FILTER (WHERE NOT o.is_void), 0) AS subtotal,
			COALESCE(SUM(o.discount) FILTER (WHERE NOT o.is_void), 0) AS discount,
			COALESCE(SUM(o.shipping) FILTER (WHERE NOT o.is_void), 0) AS shipping
		FROM ${scopedOrders(filters, range)} o
		${itemTotalsJoin(filters)}`,
	);

	const placed = num(row?.placed);
	const orders = num(row?.orders);
	const cancelled = num(row?.cancelled);
	const refunded = num(row?.refunded);
	const revenue = num(row?.revenue);
	const units = num(row?.units);
	const positions = num(row?.positions);
	const itemRevenue = num(row?.item_revenue);
	const customers = num(row?.customers);
	const subtotal = num(row?.subtotal);
	const discount = num(row?.discount);

	return {
		placed,
		orders,
		cancelled,
		refunded,
		revenue,
		avgCheck: ratio(revenue, orders),
		medianCheck: numOrNull(row?.median_check),
		lostRevenue: num(row?.lost_revenue),
		voidRate: ratio(cancelled + refunded, placed),
		delivered: num(row?.delivered),
		deliveredRevenue: num(row?.delivered_revenue),
		open: num(row?.open),
		openRevenue: num(row?.open_revenue),
		paid: num(row?.paid),
		paidRevenue: num(row?.paid_revenue),
		units,
		positions,
		itemRevenue,
		unitsPerOrder: ratio(units, orders),
		positionsPerOrder: ratio(positions, orders),
		avgUnitPrice: ratio(itemRevenue, units),
		customers,
		revenuePerCustomer: ratio(revenue, customers),
		subtotal,
		discount,
		discountRate: ratio(discount, subtotal),
		shipping: num(row?.shipping),
	};
}

/** Шаги времени без пропусков: день без заказов — ноль на графике, а не дыра. */
export function bucketSeries(range: DateRange, granularity: Granularity): SQL {
	const step = sql.raw(`'1 ${granularity}'`);
	const unit = sql.raw(`'${granularity}'`);
	return sql`(
		SELECT gs::date AS bucket,
			(gs + ${step}::interval - interval '1 day')::date AS bucket_end
		FROM generate_series(
			date_trunc(${unit}, ${range.from}::date::timestamp),
			${range.to}::date::timestamp,
			${step}::interval
		) gs
	)`;
}

export async function fetchSeries(
	db: Executor,
	filters: AnalyticsFilters,
	range: DateRange,
	granularity: Granularity,
): Promise<SeriesPoint[]> {
	const rows = await query(
		db,
		sql`WITH agg AS (
			SELECT
				${bucketOf(sql`o.created_at`, granularity)} AS bucket,
				COUNT(*) AS placed,
				COUNT(*) FILTER (WHERE NOT o.is_void) AS orders,
				COALESCE(SUM(o.total) FILTER (WHERE NOT o.is_void), 0) AS revenue,
				COALESCE(SUM(x.units) FILTER (WHERE NOT o.is_void), 0) AS units
			FROM ${scopedOrders(filters, range)} o
			${itemTotalsJoin(filters)}
			GROUP BY 1
		)
		SELECT
			b.bucket::text AS start,
			b.bucket_end::text AS "end",
			COALESCE(a.placed, 0) AS placed,
			COALESCE(a.orders, 0) AS orders,
			COALESCE(a.revenue, 0) AS revenue,
			COALESCE(a.units, 0) AS units
		FROM ${bucketSeries(range, granularity)} b
		LEFT JOIN agg a ON a.bucket = b.bucket
		ORDER BY b.bucket`,
	);

	return rows.map((row) => {
		const start = String(row.start);
		const end = String(row.end);
		const orders = num(row.orders);
		const revenue = num(row.revenue);
		return {
			start,
			end,
			partial: start < range.from || end > range.to,
			placed: num(row.placed),
			orders,
			revenue,
			units: num(row.units),
			avgCheck: ratio(revenue, orders),
		};
	});
}

async function fetchMix(
	db: Executor,
	scope: SQL,
	column: "delivery_method" | "payment_method" | "payment_status" | "source",
): Promise<MixRow[]> {
	const rows = await query(
		db,
		sql`SELECT ${sql.raw(`o.${column}`)} AS key,
			COUNT(*) AS orders,
			COALESCE(SUM(o.total), 0) AS revenue
		FROM ${scope} o
		WHERE NOT o.is_void AND ${sql.raw(`o.${column}`)} IS NOT NULL
		GROUP BY 1
		ORDER BY 2 DESC`,
	);
	return rows.map((row) => ({
		key: String(row.key),
		orders: num(row.orders),
		revenue: num(row.revenue),
	}));
}

export async function buildOverview(
	db: Executor,
	filters: AnalyticsFilters,
	period: PeriodInfo,
): Promise<OverviewDTO> {
	const range: DateRange = { from: period.from, to: period.to };
	const scope = scopedOrders(filters, range);

	const current = await fetchTotals(db, filters, range);
	const previous = period.compare
		? await fetchTotals(db, filters, period.compare)
		: null;
	const series = await fetchSeries(db, filters, range, period.granularity);
	const previousSeries = period.compare
		? await fetchSeries(db, filters, period.compare, period.granularity)
		: null;

	const statusRows = await query(
		db,
		sql`SELECT o.status, COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS amount
		FROM ${scope} o GROUP BY 1`,
	);
	const statusMap = new Map(statusRows.map((row) => [String(row.status), row]));
	// Порядок статусов — порядок работы с заказом, а не величина: иначе
	// ряд перестраивался бы при каждом переключении периода.
	const statuses = ORDER_STATUSES.flatMap((status: AnalyticsOrderStatus) => {
		const row = statusMap.get(status);
		return row
			? [{ status, orders: num(row.orders), amount: num(row.amount) }]
			: [];
	});

	const promoTotals = await queryOne(
		db,
		sql`SELECT
			COUNT(*) FILTER (WHERE NULLIF(trim(COALESCE(o.promo_code, '')), '') IS NOT NULL) AS orders,
			COALESCE(SUM(o.total) FILTER (WHERE NULLIF(trim(COALESCE(o.promo_code, '')), '') IS NOT NULL), 0) AS revenue,
			COALESCE(SUM(o.promo_discount), 0) AS discount
		FROM ${scope} o WHERE NOT o.is_void`,
	);
	const promoTop = await query(
		db,
		sql`SELECT upper(trim(o.promo_code)) AS code,
			COUNT(*) AS orders,
			COALESCE(SUM(o.total), 0) AS revenue,
			COALESCE(SUM(o.promo_discount), 0) AS discount
		FROM ${scope} o
		WHERE NOT o.is_void AND NULLIF(trim(COALESCE(o.promo_code, '')), '') IS NOT NULL
		GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 8`,
	);

	const heatRows = await query(
		db,
		sql`SELECT
			EXTRACT(ISODOW FROM ${localTime(sql`o.created_at`)})::int - 1 AS weekday,
			EXTRACT(HOUR FROM ${localTime(sql`o.created_at`)})::int AS hour,
			COUNT(*) AS orders
		FROM ${scope} o WHERE NOT o.is_void GROUP BY 1, 2`,
	);
	const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
	for (const row of heatRows) {
		heatmap[num(row.weekday)][num(row.hour)] = num(row.orders);
	}

	return {
		section: "overview",
		period,
		current,
		previous,
		series,
		previousSeries,
		statuses,
		delivery: await fetchMix(db, scope, "delivery_method"),
		payment: await fetchMix(db, scope, "payment_method"),
		paymentStatus: await fetchMix(db, scope, "payment_status"),
		source: await fetchMix(db, scope, "source"),
		promo: {
			orders: num(promoTotals?.orders),
			revenue: num(promoTotals?.revenue),
			discount: num(promoTotals?.discount),
			top: promoTop.map((row) => ({
				code: str(row.code) ?? "",
				orders: num(row.orders),
				revenue: num(row.revenue),
				discount: num(row.discount),
			})),
		},
		heatmap,
	};
}
