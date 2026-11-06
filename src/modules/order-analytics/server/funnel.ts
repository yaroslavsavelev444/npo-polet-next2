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
	CUSTOMER_TYPES,
	DELIVERY_METHODS,
	FUNNEL_STAGES,
	PAYMENT_METHODS,
} from "../lib/constants.ts";
import type { AnalyticsFilters, DateRange } from "../lib/query.ts";
import type {
	FunnelDTO,
	FunnelStageRow,
	PeriodInfo,
	VoidSliceRow,
} from "../lib/types.ts";
import { ratio } from "./overview.ts";
import { scopedOrders } from "./scope.ts";

/**
 * Воронка обработки заказа — только по тому, что система действительно знает.
 *
 * До заказа воронки здесь нет и быть не может: события «просмотр → корзина →
 * оформление» копит Яндекс.Метрика и только с согласия на cookie, а корзина в
 * базе — текущее состояние без истории. Выдавать счётчик просмотров за
 * верхний этап воронки значило бы придумать конверсию, поэтому корзины
 * показаны отдельным снимком, а не этапом.
 *
 * Какого этапа достиг заказ:
 *  • действующий — текущий статус (или более поздний из истории: заказ могли
 *    вернуть назад, но этап он уже проходил);
 *  • отменённый и возвращённый — только то, что записано в истории статусов.
 *    История пишется при оформлении и отмене покупателем, а смена статуса из
 *    админки её не пополняет (см. orders.service.ts), поэтому для отмен это
 *    «последний ЗАФИКСИРОВАННЫЙ этап», и страница говорит об этом прямо.
 */

function stageRank(column: SQL): SQL {
	const whens = FUNNEL_STAGES.flatMap((stage, rank) =>
		stage.statuses.map(
			(status) =>
				sql`WHEN ${column} = ${sql.raw(`'${status}'`)} THEN ${sql.raw(String(rank))}`,
		),
	);
	return sql`CASE ${sql.join(whens, sql` `)} ELSE NULL END`;
}

const AGE_BANDS = ["0-3", "4-7", "8-14", "15-30", "31+"];

function ageBand(days: SQL): SQL {
	return sql`CASE
		WHEN ${days} <= 3 THEN '0-3'
		WHEN ${days} <= 7 THEN '4-7'
		WHEN ${days} <= 14 THEN '8-14'
		WHEN ${days} <= 30 THEN '15-30'
		ELSE '31+'
	END`;
}

/** Доля отмен в заказах периода — для подписи «было» в блоке отмен. */
async function fetchVoidRate(
	db: Executor,
	filters: AnalyticsFilters,
	range: DateRange,
): Promise<number | null> {
	const row = await queryOne(
		db,
		sql`SELECT COUNT(*) AS placed, COUNT(*) FILTER (WHERE o.is_void) AS voided
		FROM ${scopedOrders(filters, range)} o`,
	);
	return ratio(num(row?.voided), num(row?.placed));
}

export async function buildFunnel(
	db: Executor,
	filters: AnalyticsFilters,
	period: PeriodInfo,
): Promise<FunnelDTO> {
	const range: DateRange = { from: period.from, to: period.to };
	const scope = scopedOrders(filters, range);

	const stageRows = await query(
		db,
		sql`WITH history AS (
			SELECT h._parent_id AS id,
				MAX(${stageRank(sql`h.status::text`)}) AS rank,
				COUNT(*) FILTER (WHERE h.status <> 'pending') AS transitions
			FROM orders_status_history h
			WHERE h._parent_id IN (SELECT s.id FROM ${scope} s)
			GROUP BY 1
		), per_order AS (
			SELECT o.id, o.is_void, o.total,
				${stageRank(sql`o.status`)} AS current_rank,
				COALESCE(h.rank, 0) AS history_rank,
				COALESCE(h.transitions, 0) AS transitions
			FROM ${scope} o
			LEFT JOIN history h ON h.id = o.id
		)
		SELECT
			is_void,
			current_rank,
			CASE WHEN is_void THEN history_rank ELSE GREATEST(current_rank, history_rank) END AS reached,
			COUNT(*) AS orders,
			COALESCE(SUM(total), 0) AS amount,
			COUNT(*) FILTER (WHERE transitions > 0) AS with_transitions
		FROM per_order
		GROUP BY 1, 2, 3`,
	);

	const stageCount = FUNNEL_STAGES.length;
	const reached = Array<number>(stageCount).fill(0);
	const reachedAmount = Array<number>(stageCount).fill(0);
	const active = Array<number>(stageCount).fill(0);
	const lost = Array<number>(stageCount).fill(0);
	const lostAmount = Array<number>(stageCount).fill(0);
	let placed = 0;
	let withTransitions = 0;

	for (const row of stageRows) {
		const orders = num(row.orders);
		const amount = num(row.amount);
		const rank = num(row.reached);
		placed += orders;
		withTransitions += num(row.with_transitions);
		for (let stage = 0; stage <= rank; stage++) {
			reached[stage] += orders;
			reachedAmount[stage] += amount;
		}
		if (row.is_void) {
			lost[rank] += orders;
			lostAmount[rank] += amount;
		} else if (num(row.current_rank) < stageCount - 1) {
			active[num(row.current_rank)] += orders;
		}
	}

	const stages: FunnelStageRow[] = FUNNEL_STAGES.map((stage, index) => {
		const next = index + 1 < stageCount ? reached[index + 1] : null;
		return {
			key: stage.key,
			label: stage.label,
			reached: reached[index],
			reachedAmount: reachedAmount[index],
			active: active[index],
			lost: lost[index],
			lostAmount: lostAmount[index],
			conversionToNext: next === null ? null : ratio(next, reached[index]),
			closedConversionToNext:
				next === null ? null : ratio(next, reached[index] - active[index]),
		};
	});

	const pickWorst = (values: number[]): string | null => {
		const max = Math.max(...values);
		return max > 0 ? FUNNEL_STAGES[values.indexOf(max)].label : null;
	};

	const timingRows = await query(
		db,
		sql`WITH first_reached AS (
			SELECT o.id, o.created_at, ${stageRank(sql`h.status::text`)} AS rank, MIN(h.changed_at) AS reached_at
			FROM ${scope} o
			JOIN orders_status_history h ON h._parent_id = o.id
			WHERE h.changed_at IS NOT NULL AND h.status NOT IN ('cancelled', 'refunded')
			GROUP BY 1, 2, 3
		)
		SELECT rank,
			percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM reached_at - created_at) / 3600) AS median_hours,
			COUNT(*) AS sample
		FROM first_reached
		WHERE rank > 0
		GROUP BY 1`,
	);
	const timingMap = new Map(timingRows.map((row) => [num(row.rank), row]));

	const voidTotals = await queryOne(
		db,
		sql`SELECT
			COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled,
			COUNT(*) FILTER (WHERE o.status = 'refunded') AS refunded,
			COALESCE(SUM(o.total) FILTER (WHERE o.status = 'cancelled'), 0) AS cancelled_amount,
			COALESCE(SUM(o.total) FILTER (WHERE o.status = 'refunded'), 0) AS refunded_amount
		FROM ${scope} o`,
	);
	const reasonRows = await query(
		db,
		sql`SELECT
			mode() WITHIN GROUP (ORDER BY trim(h.comment)) AS reason,
			COUNT(DISTINCT o.id) AS orders
		FROM ${scope} o
		JOIN orders_status_history h ON h._parent_id = o.id
		WHERE h.status = 'cancelled' AND NULLIF(trim(COALESCE(h.comment, '')), '') IS NOT NULL
		GROUP BY lower(trim(h.comment))
		ORDER BY 2 DESC, 1
		LIMIT 8`,
	);

	const sliceRows = await query(
		db,
		sql`SELECT 'delivery' AS dimension, o.delivery_method AS key, COUNT(*) AS placed, COUNT(*) FILTER (WHERE o.is_void) AS voided
			FROM ${scope} o GROUP BY 2
		UNION ALL
		SELECT 'payment', o.payment_method, COUNT(*), COUNT(*) FILTER (WHERE o.is_void)
			FROM ${scope} o GROUP BY 2
		UNION ALL
		SELECT 'customerType', o.customer_type, COUNT(*), COUNT(*) FILTER (WHERE o.is_void)
			FROM ${scope} o GROUP BY 2`,
	);
	const sliceOrder = [
		...DELIVERY_METHODS,
		...PAYMENT_METHODS,
		...CUSTOMER_TYPES,
	] as readonly string[];
	const slices: VoidSliceRow[] = sliceRows
		.filter((row) => row.key !== null)
		.map((row) => ({
			dimension: String(row.dimension) as VoidSliceRow["dimension"],
			key: String(row.key),
			placed: num(row.placed),
			voided: num(row.voided),
			rate: ratio(num(row.voided), num(row.placed)),
		}))
		.sort((a, b) => sliceOrder.indexOf(a.key) - sliceOrder.indexOf(b.key));

	const paymentRows = await query(
		db,
		sql`SELECT o.payment_method AS method,
			COUNT(*) AS orders,
			COUNT(*) FILTER (WHERE o.payment_invoice_file_id IS NOT NULL) AS invoice_attached,
			COUNT(*) FILTER (WHERE o.payment_status = 'paid') AS paid,
			percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM o.payment_paid_at - o.created_at) / 86400)
				FILTER (WHERE o.payment_status = 'paid' AND o.payment_paid_at IS NOT NULL) AS median_days,
			COUNT(*) FILTER (WHERE o.payment_status = 'paid' AND o.payment_paid_at IS NOT NULL) AS days_sample
		FROM ${scope} o
		WHERE NOT o.is_void
		GROUP BY 1
		ORDER BY 2 DESC`,
	);

	// Снимок «сейчас»: зависший заказ не должен исчезать из отчёта только потому,
	// что его оформили раньше начала выбранного периода.
	const openScope = sql`(SELECT * FROM ${scopedOrders(filters, null)} o WHERE NOT o.is_void AND o.status <> 'delivered')`;
	const ageDays = sql`(EXTRACT(EPOCH FROM NOW() - o.created_at) / 86400)`;
	const agingRows = await query(
		db,
		sql`SELECT ${ageBand(ageDays)} AS band, COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS amount
		FROM ${openScope} o GROUP BY 1`,
	);
	const agingMap = new Map(agingRows.map((row) => [String(row.band), row]));
	const oldestRows = await query(
		db,
		sql`SELECT o.id, o.order_number, o.status, o.total, ${ageDays} AS age_days
		FROM ${openScope} o
		ORDER BY o.created_at ASC, o.id
		LIMIT 10`,
	);

	const cartRows = await query(
		db,
		sql`WITH filled AS (
			SELECT c.id, GREATEST(c.updated_at, MAX(i.added_at)) AS touched_at, SUM(i.quantity) AS units
			FROM carts c JOIN carts_items i ON i._parent_id = c.id
			GROUP BY c.id, c.updated_at
		)
		SELECT ${ageBand(sql`(EXTRACT(EPOCH FROM NOW() - touched_at) / 86400)`)} AS band,
			COUNT(*) AS carts,
			COALESCE(SUM(units), 0) AS units
		FROM filled GROUP BY 1`,
	);
	const cartMap = new Map(cartRows.map((row) => [String(row.band), row]));

	return {
		section: "funnel",
		period,
		placed,
		stages,
		biggestLossStage: pickWorst(lost),
		biggestQueueStage: pickWorst(active),
		historyCoverage: { withTransitions, total: placed },
		stageTiming: FUNNEL_STAGES.slice(1).map((stage, index) => {
			const row = timingMap.get(index + 1);
			return {
				key: stage.key,
				label: stage.label,
				medianHours: numOrNull(row?.median_hours),
				sample: num(row?.sample),
			};
		}),
		void: {
			cancelled: num(voidTotals?.cancelled),
			refunded: num(voidTotals?.refunded),
			cancelledAmount: num(voidTotals?.cancelled_amount),
			refundedAmount: num(voidTotals?.refunded_amount),
			rate: ratio(
				num(voidTotals?.cancelled) + num(voidTotals?.refunded),
				placed,
			),
			previousRate: period.compare
				? await fetchVoidRate(db, filters, period.compare)
				: null,
			reasons: reasonRows.map((row) => ({
				reason: str(row.reason) ?? "",
				orders: num(row.orders),
			})),
			slices,
		},
		payment: paymentRows.map((row) => ({
			method: String(row.method),
			orders: num(row.orders),
			invoiceAttached: num(row.invoice_attached),
			paid: num(row.paid),
			paidRate: ratio(num(row.paid), num(row.orders)),
			medianDaysToPay: numOrNull(row.median_days),
			daysToPaySample: num(row.days_sample),
		})),
		openNow: {
			total: AGE_BANDS.reduce(
				(sum, band) => sum + num(agingMap.get(band)?.orders),
				0,
			),
			amount: AGE_BANDS.reduce(
				(sum, band) => sum + num(agingMap.get(band)?.amount),
				0,
			),
			aging: AGE_BANDS.map((key) => ({
				key,
				orders: num(agingMap.get(key)?.orders),
				amount: num(agingMap.get(key)?.amount),
			})),
			oldest: oldestRows.map((row) => ({
				id: num(row.id),
				orderNumber: String(row.order_number),
				status: String(row.status) as AnalyticsOrderStatus,
				ageDays: Math.floor(num(row.age_days)),
				total: num(row.total),
			})),
		},
		carts: {
			nonEmpty: AGE_BANDS.reduce(
				(sum, band) => sum + num(cartMap.get(band)?.carts),
				0,
			),
			units: AGE_BANDS.reduce(
				(sum, band) => sum + num(cartMap.get(band)?.units),
				0,
			),
			aging: AGE_BANDS.map((key) => ({
				key,
				carts: num(cartMap.get(key)?.carts),
			})),
		},
	};
}
