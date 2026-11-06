import { sql } from "@payloadcms/db-postgres";
import {
	type Executor,
	num,
	numOrNull,
	query,
	queryOne,
	type Row,
	type SQL,
} from "../../support-chat/server/db.ts";
import {
	REGION_PICKUP,
	REGION_SPECIAL_LABELS,
	REGION_UNKNOWN,
} from "../lib/constants.ts";
import type { AnalyticsFilters, DateRange } from "../lib/query.ts";
import type { GeoDTO, GeoRow, PeriodInfo } from "../lib/types.ts";
import { ratio } from "./overview.ts";
import { scopedOrders } from "./scope.ts";

/** Строк таблицы регионов и городов. Остальное — итогом «и ещё N». */
const GEO_LIMIT = 50;
/** Рост с нуля или с пары заказов — шум, а не «самый растущий регион». */
const GROWTH_MIN_ORDERS = 3;

type GeoDimension = "region" | "city" | "pickup";

const KEY: Record<GeoDimension, SQL> = {
	region: sql`o.region_key`,
	// Город регистронезависимо: ручной ввод даёт «КАЛУГА» и «Калуга».
	city: sql`lower(o.city_label)`,
	pickup: sql`pp.id::text`,
};

const LABEL: Record<GeoDimension, SQL> = {
	region: sql`MAX(o.region_label)`,
	// Показываем самое частое написание, а не случайное из групп.
	city: sql`mode() WITHIN GROUP (ORDER BY o.city_label)`,
	pickup: sql`MAX(COALESCE(pp.name, pp.city))`,
};

const WHERE: Record<GeoDimension, SQL> = {
	region: sql`TRUE`,
	city: sql`o.city_label IS NOT NULL AND o.delivery_method <> 'self_pickup'`,
	pickup: sql`o.delivery_pickup_point_id IS NOT NULL`,
};

function aggregate(
	dimension: GeoDimension,
	filters: AnalyticsFilters,
	range: DateRange,
): SQL {
	return sql`(
		SELECT
			${KEY[dimension]} AS key,
			${LABEL[dimension]} AS label,
			COUNT(*) FILTER (WHERE NOT o.is_void) AS orders,
			COUNT(*) AS placed,
			COALESCE(SUM(o.total) FILTER (WHERE NOT o.is_void), 0) AS revenue,
			COUNT(DISTINCT o.user_id) FILTER (WHERE NOT o.is_void) AS customers
		FROM ${scopedOrders(filters, range)} o
		LEFT JOIN pickup_points pp ON pp.id = o.delivery_pickup_point_id
		WHERE ${WHERE[dimension]}
		GROUP BY 1
	)`;
}

function toGeoRow(row: Row): GeoRow {
	const key = String(row.key);
	const orders = num(row.orders);
	const revenue = num(row.revenue);
	return {
		key,
		label: REGION_SPECIAL_LABELS[key] ?? String(row.label ?? key),
		orders,
		placed: num(row.placed),
		revenue,
		customers: num(row.customers),
		avgCheck: ratio(revenue, orders),
		prevOrders: numOrNull(row.prev_orders),
		prevRevenue: numOrNull(row.prev_revenue),
	};
}

async function fetchGeo(
	db: Executor,
	dimension: GeoDimension,
	filters: AnalyticsFilters,
	period: PeriodInfo,
	limit: number,
): Promise<{ rows: GeoRow[]; total: number }> {
	const range = { from: period.from, to: period.to };
	const rows = await query(
		db,
		sql`SELECT a.*,
			${period.compare ? sql`COALESCE(prev.orders, 0)` : sql`NULL::bigint`} AS prev_orders,
			${period.compare ? sql`COALESCE(prev.revenue, 0)` : sql`NULL::numeric`} AS prev_revenue,
			COUNT(*) OVER () AS total_rows
		FROM ${aggregate(dimension, filters, range)} a
		${
			period.compare
				? sql`LEFT JOIN ${aggregate(dimension, filters, period.compare)} prev ON prev.key = a.key`
				: sql``
		}
		ORDER BY a.orders DESC, a.revenue DESC, a.key
		LIMIT ${limit}`,
	);
	return { rows: rows.map(toGeoRow), total: num(rows[0]?.total_rows) };
}

export async function buildGeo(
	db: Executor,
	filters: AnalyticsFilters,
	period: PeriodInfo,
): Promise<GeoDTO> {
	const range = { from: period.from, to: period.to };
	const coverage = await queryOne(
		db,
		sql`SELECT
			COUNT(*) AS orders,
			COALESCE(SUM(o.total), 0) AS revenue,
			COUNT(*) FILTER (WHERE o.region_key = ${REGION_PICKUP}) AS pickup,
			COUNT(*) FILTER (WHERE o.region_key = ${REGION_UNKNOWN}) AS unknown_region,
			COUNT(*) FILTER (WHERE o.region_key NOT IN (${REGION_PICKUP}, ${REGION_UNKNOWN})) AS with_region,
			COUNT(*) FILTER (WHERE o.city_label IS NOT NULL AND o.delivery_method <> 'self_pickup') AS with_city
		FROM ${scopedOrders(filters, range)} o
		WHERE NOT o.is_void`,
	);

	const regions = await fetchGeo(db, "region", filters, period, GEO_LIMIT);
	const cities = await fetchGeo(db, "city", filters, period, GEO_LIMIT);
	const pickupPoints = await fetchGeo(db, "pickup", filters, period, 20);

	// Лидеры — только среди настоящих регионов: «Самовывоз» и «Не указан» не
	// ответ на вопрос «где покупают больше».
	const realRegions = regions.rows.filter(
		(row) => !(row.key in REGION_SPECIAL_LABELS) && row.orders > 0,
	);
	const best = (score: (row: GeoRow) => number) =>
		realRegions.length
			? realRegions.reduce((a, b) => (score(b) > score(a) ? b : a))
			: null;
	const growing = realRegions.filter(
		(row) =>
			row.orders >= GROWTH_MIN_ORDERS &&
			row.prevOrders !== null &&
			row.prevOrders > 0 &&
			row.orders > row.prevOrders,
	);

	return {
		section: "geo",
		period,
		totals: { orders: num(coverage?.orders), revenue: num(coverage?.revenue) },
		coverage: {
			withRegion: num(coverage?.with_region),
			pickup: num(coverage?.pickup),
			unknownRegion: num(coverage?.unknown_region),
			withCity: num(coverage?.with_city),
		},
		leaders: {
			byOrders: best((row) => row.orders),
			byRevenue: best((row) => row.revenue),
			fastestGrowth: growing.length
				? growing.reduce((a, b) =>
						b.orders / (b.prevOrders ?? 1) > a.orders / (a.prevOrders ?? 1)
							? b
							: a,
					)
				: null,
		},
		regions,
		cities,
		pickupPoints: pickupPoints.rows,
	};
}
