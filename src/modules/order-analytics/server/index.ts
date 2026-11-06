import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import {
	type Executor,
	num,
	query,
	queryOne,
	str,
} from "../../support-chat/server/db.ts";
import { ANALYTICS_TIMEZONE, REGION_SPECIAL_LABELS } from "../lib/constants.ts";
import {
	type AnalyticsFilters,
	type AnalyticsQuery,
	daysInRange,
	resolveCompareRange,
	resolveGranularity,
} from "../lib/query.ts";
import type { AnalyticsResponse, MetaDTO, PeriodInfo } from "../lib/types.ts";
import { buildCustomers } from "./customers.ts";
import { buildFunnel } from "./funnel.ts";
import { buildGeo } from "./geo.ts";
import { buildOverview } from "./overview.ts";
import { buildProducts, buildProductTable } from "./products.ts";
import { localTime, scopedOrders } from "./scope.ts";

/**
 * Сколько может считаться один раздел. Запас большой: на 200 тыс. заказов раздел
 * укладывается в секунды. Предел здесь защищает базу магазина, чтобы аналитика
 * не могла занять соединение надолго и притормозить оформление заказов.
 */
const STATEMENT_TIMEOUT = "30s";

const NO_FILTERS: AnalyticsFilters = {
	statuses: null,
	customerType: null,
	delivery: null,
	payment: null,
	paymentStatus: null,
	source: null,
	categoryId: null,
	region: null,
};

async function resolvePeriodInfo(
	db: Executor,
	input: AnalyticsQuery,
): Promise<PeriodInfo> {
	let from = input.range.from;
	if (from === null) {
		// «Всё время» — от первого заказа; пустая база — один текущий день.
		const first = await queryOne(
			db,
			sql`SELECT MIN(${localTime(sql`created_at`)})::date::text AS first FROM orders`,
		);
		from = str(first?.first) ?? input.range.to;
	}
	const range = { from, to: input.range.to };
	const days = daysInRange(range);
	// У «всего времени» нет предыдущего периода — до первого заказа данных нет.
	const compareMode = input.period === "all" ? "none" : input.compareMode;
	return {
		from,
		to: range.to,
		days,
		compareMode,
		compare: resolveCompareRange(range, compareMode),
		granularity: resolveGranularity(input.granularity, days),
		timezone: ANALYTICS_TIMEZONE,
	};
}

async function buildMeta(db: Executor): Promise<MetaDTO> {
	const totals = await queryOne(
		db,
		sql`SELECT
			COUNT(*) AS total,
			MIN(${localTime(sql`created_at`)})::date::text AS first,
			MAX(${localTime(sql`created_at`)})::date::text AS last
		FROM orders`,
	);
	const categories = await query(
		db,
		sql`SELECT c.id, COALESCE(cl.name, c.slug) AS label
		FROM categories c
		LEFT JOIN categories_locales cl ON cl._parent_id = c.id AND cl._locale = 'ru'
		ORDER BY 2`,
	);
	const regions = await query(
		db,
		sql`SELECT o.region_key AS key, MAX(o.region_label) AS label, COUNT(*) AS orders
		FROM ${scopedOrders(NO_FILTERS, null)} o
		GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT 200`,
	);
	return {
		section: "meta",
		firstOrderDate: str(totals?.first),
		lastOrderDate: str(totals?.last),
		totalOrders: num(totals?.total),
		categories: categories.map((row) => ({
			id: num(row.id),
			label: String(row.label),
		})),
		regions: regions.map((row) => ({
			key: String(row.key),
			label:
				REGION_SPECIAL_LABELS[String(row.key)] ?? String(row.label ?? row.key),
			orders: num(row.orders),
		})),
	};
}

/** Раздел отчёта на готовом соединении (транзакция запроса или теста). */
export async function buildSection(
	db: Executor,
	input: AnalyticsQuery,
): Promise<AnalyticsResponse> {
	if (input.section === "meta") return buildMeta(db);
	const period = await resolvePeriodInfo(db, input);
	switch (input.section) {
		case "overview":
			return buildOverview(db, input.filters, period);
		case "products":
			return buildProducts(db, input.filters, period);
		case "product_table":
			return buildProductTable(db, input.filters, period, input.products);
		case "geo":
			return buildGeo(db, input.filters, period);
		case "customers":
			return buildCustomers(db, input.filters, period);
		case "funnel":
			return buildFunnel(db, input.filters, period);
	}
}

interface ConfigurableTransaction {
	transaction: <T>(
		fn: (tx: Executor) => Promise<T>,
		config: {
			isolationLevel: "repeatable read";
			accessMode: "read only";
		},
	) => Promise<T>;
}

/**
 * Весь раздел считается в одной транзакции «только чтение» на снимке базы.
 *
 * Снимок — чтобы новый заказ посреди расчёта не развёл карточки и таблицы
 * одной страницы. «Только чтение» — вторая линия защиты: код этого модуля
 * физически не может ничего изменить в заказах.
 */
export function buildAnalyticsSection(
	payload: Payload,
	input: AnalyticsQuery,
): Promise<AnalyticsResponse> {
	const drizzle = payload.db.drizzle as unknown as ConfigurableTransaction;
	return drizzle.transaction(
		async (tx) => {
			await tx.execute(
				sql.raw(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`),
			);
			return buildSection(tx, input);
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}
