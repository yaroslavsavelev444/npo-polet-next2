import { sql } from "@payloadcms/db-postgres";
import {
	type Executor,
	iso,
	num,
	numOrNull,
	query,
	queryOne,
	str,
} from "../../support-chat/server/db.ts";
import {
	CUSTOMER_TYPES,
	type CustomerType,
	type Granularity,
} from "../lib/constants.ts";
import type { AnalyticsFilters, DateRange } from "../lib/query.ts";
import type {
	CohortRow,
	CustomersDTO,
	CustomerTotals,
	PeriodInfo,
} from "../lib/types.ts";
import { bucketSeries, ratio } from "./overview.ts";
import {
	bucketOf,
	dayEndExclusive,
	dayStart,
	localTime,
	scopedOrders,
	VALID_CUSTOMER_ORDERS,
} from "./scope.ts";

/**
 * Клиент — учётная запись покупателя (orders.user_id), и только она.
 *
 * Заказ без покупателя (обезличен после удаления аккаунта или перенесён без
 * владельца) ни к кому не приписывается: склеивать такие заказы по email
 * получателя нельзя — получателем бывает другой человек. Они считаются
 * отдельной строкой (`unattributedOrders`), чтобы базу расчёта было видно.
 *
 * «Новый» и «повторный» определяются по ВСЕЙ истории клиента без фильтров
 * отчёта: покупатель из Калуги, вчера впервые купивший в Москве, не новый
 * клиент, сколько бы фильтров ни было включено. Фильтры решают только, какие
 * заказы и клиенты попали в отчёт.
 */

const FREQUENCY_BANDS = ["1", "2", "3", "4-5", "6-10", "11+"];
const RECENCY_BANDS = ["0-30", "31-90", "91-180", "181-365", "366+"];
const COHORT_MONTHS = 12;

async function fetchCustomerTotals(
	db: Executor,
	filters: AnalyticsFilters,
	range: DateRange,
): Promise<CustomerTotals> {
	const row = await queryOne(
		db,
		sql`WITH ranked AS (
			SELECT v.id, v.user_id, v.created_at,
				ROW_NUMBER() OVER w AS rn,
				LAG(v.created_at) OVER w AS previous_at
			FROM ${VALID_CUSTOMER_ORDERS} v
			WINDOW w AS (PARTITION BY v.user_id ORDER BY v.created_at, v.id)
		), scope AS (
			SELECT o.id, o.user_id, o.total, r.rn, r.previous_at, o.created_at
			FROM ${scopedOrders(filters, range)} o
			JOIN ranked r ON r.id = o.id
		), lifetime AS (
			SELECT r.user_id,
				MIN(r.created_at) AS first_at,
				COUNT(*) FILTER (WHERE r.created_at < ${dayEndExclusive(range.to)}) AS lifetime_orders
			FROM ranked r
			GROUP BY r.user_id
		), per_customer AS (
			SELECT s.user_id, COUNT(*) AS orders, MAX(l.first_at) AS first_at, MAX(l.lifetime_orders) AS lifetime_orders
			FROM scope s
			JOIN lifetime l ON l.user_id = s.user_id
			GROUP BY s.user_id
		)
		SELECT
			(SELECT COUNT(*) FROM per_customer) AS customers,
			(SELECT COUNT(*) FROM per_customer WHERE first_at >= ${dayStart(range.from)}) AS new_customers,
			(SELECT COUNT(*) FROM per_customer WHERE first_at < ${dayStart(range.from)}) AS returning_customers,
			(SELECT COUNT(*) FROM per_customer WHERE lifetime_orders >= 2) AS repeat_customers,
			(SELECT COUNT(*) FROM per_customer WHERE orders >= 2) AS repeat_within_period,
			(SELECT COUNT(*) FROM scope WHERE rn = 1) AS first_orders,
			(SELECT COUNT(*) FROM scope WHERE rn > 1) AS repeat_orders,
			(SELECT COALESCE(SUM(total), 0) FROM scope WHERE rn = 1) AS first_revenue,
			(SELECT COALESCE(SUM(total), 0) FROM scope WHERE rn > 1) AS repeat_revenue,
			(SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM created_at - previous_at) / 86400)
				FROM scope WHERE previous_at IS NOT NULL) AS median_days,
			(SELECT COUNT(*) FROM scope WHERE previous_at IS NOT NULL) AS days_sample,
			(SELECT COUNT(*) FROM ${scopedOrders(filters, range)} o WHERE o.user_id IS NULL AND NOT o.is_void) AS unattributed_orders,
			(SELECT COALESCE(SUM(o.total), 0) FROM ${scopedOrders(filters, range)} o WHERE o.user_id IS NULL AND NOT o.is_void) AS unattributed_revenue`,
	);

	const customers = num(row?.customers);
	const firstOrders = num(row?.first_orders);
	const repeatOrders = num(row?.repeat_orders);
	const firstOrderRevenue = num(row?.first_revenue);
	const repeatOrderRevenue = num(row?.repeat_revenue);
	const orders = firstOrders + repeatOrders;
	const repeatCustomers = num(row?.repeat_customers);

	return {
		customers,
		newCustomers: num(row?.new_customers),
		returningCustomers: num(row?.returning_customers),
		repeatCustomers,
		repeatRate: ratio(repeatCustomers, customers),
		repeatWithinPeriod: num(row?.repeat_within_period),
		firstOrders,
		repeatOrders,
		repeatOrderShare: ratio(repeatOrders, orders),
		firstOrderRevenue,
		repeatOrderRevenue,
		ordersPerCustomer: ratio(orders, customers),
		revenuePerCustomer: ratio(
			firstOrderRevenue + repeatOrderRevenue,
			customers,
		),
		medianDaysBetweenOrders: numOrNull(row?.median_days),
		daysBetweenSample: num(row?.days_sample),
		unattributedOrders: num(row?.unattributed_orders),
		unattributedRevenue: num(row?.unattributed_revenue),
	};
}

export async function fetchCohorts(
	db: Executor,
	endDate: string,
): Promise<CustomersDTO["cohorts"]> {
	const end = dayEndExclusive(endDate);
	const rows = await query(
		db,
		sql`WITH valid AS (
			SELECT v.user_id, date_trunc('month', ${localTime(sql`v.created_at`)})::date AS month
			FROM ${VALID_CUSTOMER_ORDERS} v
			WHERE v.created_at < ${end}
		), firsts AS (
			SELECT user_id, MIN(month) AS cohort FROM valid GROUP BY 1
		), activity AS (
			SELECT DISTINCT f.cohort, v.user_id,
				(EXTRACT(YEAR FROM age(v.month, f.cohort)) * 12 + EXTRACT(MONTH FROM age(v.month, f.cohort)))::int AS month_offset
			FROM valid v JOIN firsts f ON f.user_id = v.user_id
		)
		SELECT a.cohort::text AS cohort, a.month_offset, COUNT(*) AS customers
		FROM activity a
		WHERE a.cohort > (date_trunc('month', ${endDate}::date) - ${sql.raw(`interval '${COHORT_MONTHS} months'`)})::date
		GROUP BY 1, 2
		ORDER BY 1, 2`,
	);

	const grouped = new Map<string, Map<number, number>>();
	for (const row of rows) {
		const cohort = String(row.cohort);
		const cells = grouped.get(cohort) ?? new Map<number, number>();
		cells.set(num(row.month_offset), num(row.customers));
		grouped.set(cohort, cells);
	}

	const endMonth =
		Number(endDate.slice(0, 4)) * 12 + Number(endDate.slice(5, 7));
	const cohortRows: CohortRow[] = [...grouped.entries()].map(
		([cohort, cells]) => {
			const size = cells.get(0) ?? 0;
			const age =
				endMonth -
				(Number(cohort.slice(0, 4)) * 12 + Number(cohort.slice(5, 7)));
			return {
				cohort,
				size,
				retention: Array.from({ length: COHORT_MONTHS }, (_, offset) =>
					offset > age ? null : (cells.get(offset) ?? 0) / (size || 1),
				),
			};
		},
	);
	return { maxOffset: COHORT_MONTHS - 1, rows: cohortRows };
}

export async function buildCustomers(
	db: Executor,
	filters: AnalyticsFilters,
	period: PeriodInfo,
): Promise<CustomersDTO> {
	const range: DateRange = { from: period.from, to: period.to };
	const scope = scopedOrders(filters, range);

	const current = await fetchCustomerTotals(db, filters, range);
	const previous = period.compare
		? await fetchCustomerTotals(db, filters, period.compare)
		: null;

	// Заказы и деньги — по типу в заказе (сходятся с итогом). Клиент считается
	// один раз: по типу последнего заказа периода. Кто покупал и как физлицо,
	// и как организация, показан отдельным числом.
	const typeOrders = await query(
		db,
		sql`SELECT o.customer_type AS type, COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS revenue
		FROM ${scope} o WHERE NOT o.is_void GROUP BY 1`,
	);
	const typeCustomers = await query(
		db,
		sql`SELECT t.customer_type AS type, COUNT(*) AS customers
		FROM (
			SELECT DISTINCT ON (o.user_id) o.user_id, o.customer_type
			FROM ${scope} o
			WHERE NOT o.is_void AND o.user_id IS NOT NULL
			ORDER BY o.user_id, o.created_at DESC, o.id DESC
		) t GROUP BY 1`,
	);
	const mixed = await queryOne(
		db,
		sql`SELECT COUNT(*) AS customers FROM (
			SELECT o.user_id FROM ${scope} o
			WHERE NOT o.is_void AND o.user_id IS NOT NULL
			GROUP BY 1 HAVING COUNT(DISTINCT o.customer_type) > 1
		) m`,
	);
	const ordersByType = new Map(typeOrders.map((r) => [String(r.type), r]));
	const customersByType = new Map(
		typeCustomers.map((r) => [String(r.type), num(r.customers)]),
	);
	const types = CUSTOMER_TYPES.flatMap((type: CustomerType) => {
		const row = ordersByType.get(type);
		if (!row) return [];
		const orders = num(row.orders);
		const revenue = num(row.revenue);
		return [
			{
				type,
				customers: customersByType.get(type) ?? 0,
				orders,
				revenue,
				avgCheck: ratio(revenue, orders),
			},
		];
	});

	const frequencyRows = await query(
		db,
		sql`WITH per_customer AS (
			SELECT o.user_id, COUNT(*) AS orders, SUM(o.total) AS revenue
			FROM ${scope} o
			WHERE NOT o.is_void AND o.user_id IS NOT NULL
			GROUP BY 1
		)
		SELECT
			CASE
				WHEN orders = 1 THEN '1'
				WHEN orders = 2 THEN '2'
				WHEN orders = 3 THEN '3'
				WHEN orders <= 5 THEN '4-5'
				WHEN orders <= 10 THEN '6-10'
				ELSE '11+'
			END AS band,
			COUNT(*) AS customers,
			SUM(revenue) AS revenue
		FROM per_customer GROUP BY 1`,
	);
	const frequencyMap = new Map(frequencyRows.map((r) => [String(r.band), r]));

	const granularity: Granularity = period.granularity;
	const seriesRows = await query(
		db,
		sql`WITH ranked AS (
			SELECT v.id, ROW_NUMBER() OVER (PARTITION BY v.user_id ORDER BY v.created_at, v.id) AS rn
			FROM ${VALID_CUSTOMER_ORDERS} v
		), agg AS (
			SELECT ${bucketOf(sql`o.created_at`, granularity)} AS bucket,
				COUNT(*) FILTER (WHERE r.rn = 1) AS first_orders,
				COUNT(*) FILTER (WHERE r.rn > 1) AS repeat_orders
			FROM ${scope} o JOIN ranked r ON r.id = o.id
			GROUP BY 1
		)
		SELECT b.bucket::text AS start,
			COALESCE(a.first_orders, 0) AS first_orders,
			COALESCE(a.repeat_orders, 0) AS repeat_orders
		FROM ${bucketSeries(range, granularity)} b
		LEFT JOIN agg a ON a.bucket = b.bucket
		ORDER BY b.bucket`,
	);

	// База клиентов на конец периода: сколько дней прошло с последней покупки.
	const recencyRows = await query(
		db,
		sql`WITH last_orders AS (
			SELECT v.user_id, MAX(v.created_at) AS last_at
			FROM ${VALID_CUSTOMER_ORDERS} v
			WHERE v.created_at < ${dayEndExclusive(period.to)}
			GROUP BY 1
		), aged AS (
			SELECT EXTRACT(EPOCH FROM ${dayEndExclusive(period.to)} - last_at) / 86400 AS days
			FROM last_orders
		)
		SELECT
			CASE
				WHEN days <= 30 THEN '0-30'
				WHEN days <= 90 THEN '31-90'
				WHEN days <= 180 THEN '91-180'
				WHEN days <= 365 THEN '181-365'
				ELSE '366+'
			END AS band,
			COUNT(*) AS customers
		FROM aged GROUP BY 1`,
	);
	const recencyMap = new Map(
		recencyRows.map((r) => [String(r.band), num(r.customers)]),
	);

	const topRows = await query(
		db,
		sql`WITH per_customer AS (
			SELECT o.user_id,
				COUNT(*) AS orders,
				SUM(o.total) AS revenue,
				MAX(o.created_at) AS last_at,
				(array_agg(o.customer_type ORDER BY o.created_at DESC, o.id DESC))[1] AS type,
				(array_agg(o.company_name ORDER BY o.created_at DESC, o.id DESC))[1] AS company
			FROM ${scope} o
			WHERE NOT o.is_void AND o.user_id IS NOT NULL
			GROUP BY 1
			ORDER BY revenue DESC, o.user_id
			LIMIT 20
		)
		SELECT p.*, u.name,
			(SELECT COUNT(*) FROM ${VALID_CUSTOMER_ORDERS} v WHERE v.user_id = p.user_id) AS lifetime_orders
		FROM per_customer p
		LEFT JOIN users u ON u.id = p.user_id
		ORDER BY p.revenue DESC, p.user_id`,
	);

	return {
		section: "customers",
		period,
		current,
		previous,
		types,
		mixedTypeCustomers: num(mixed?.customers),
		frequency: FREQUENCY_BANDS.map((key) => ({
			key,
			customers: num(frequencyMap.get(key)?.customers),
			revenue: num(frequencyMap.get(key)?.revenue),
		})),
		series: seriesRows.map((row) => ({
			start: String(row.start),
			firstOrders: num(row.first_orders),
			repeatOrders: num(row.repeat_orders),
		})),
		cohorts: await fetchCohorts(db, period.to),
		recency: RECENCY_BANDS.map((key) => ({
			key,
			customers: recencyMap.get(key) ?? 0,
		})),
		topCustomers: topRows.map((row) => ({
			userId: num(row.user_id),
			name: str(row.name) ?? `Покупатель #${num(row.user_id)}`,
			company: str(row.company),
			type: String(row.type) as CustomerType,
			orders: num(row.orders),
			revenue: num(row.revenue),
			lastOrderAt: iso(row.last_at) ?? "",
			lifetimeOrders: num(row.lifetime_orders),
		})),
	};
}
