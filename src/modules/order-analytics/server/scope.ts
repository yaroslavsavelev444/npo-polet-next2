import { sql } from "@payloadcms/db-postgres";
import type { SQL } from "../../support-chat/server/db.ts";
import {
	ANALYTICS_TIMEZONE,
	type Granularity,
	REGION_PICKUP,
	REGION_UNKNOWN,
	VOID_STATUSES,
} from "../lib/constants.ts";
import type { AnalyticsFilters, DateRange } from "../lib/query.ts";

/**
 * Единое определение «какие заказы в отчёте» и вычисляемые поля заказа.
 *
 * Все запросы раздела читают заказы только через scopedOrders: разойдись
 * фильтр между карточками и графиком, цифры на одной странице перестали бы
 * сходиться.
 *
 * Часовой пояс и шаг графика — литералами через sql.raw, и только из констант:
 * параметром они ломают GROUP BY (Postgres считает `$1` и `$5` разными
 * выражениями, даже когда значения равны).
 */

const TZ = sql.raw(`'${ANALYTICS_TIMEZONE}'`);

const VOID_LIST = sql.raw(VOID_STATUSES.map((s) => `'${s}'`).join(","));

/** Заказ — не сделка. Ожидает заказ под алиасом `o` в таблице orders. */
export const IS_VOID = sql`o.status::text IN (${VOID_LIST})`;

export function dayStart(date: string): SQL {
	return sql`((${date}::date)::timestamp AT TIME ZONE ${TZ})`;
}

export function dayEndExclusive(date: string): SQL {
	return sql`(((${date}::date + 1))::timestamp AT TIME ZONE ${TZ})`;
}

export function localTime(column: SQL): SQL {
	return sql`(${column} AT TIME ZONE ${TZ})`;
}

export function bucketOf(column: SQL, granularity: Granularity): SQL {
	return sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${localTime(column)})::date`;
}

const DIGITS = "[^0-9]";

/** ИНН и ОГРН: снимок в заказе, иначе — сохранённая организация покупателя. */
const INN = sql`COALESCE(
	NULLIF(regexp_replace(COALESCE(o.company_info_tax_number, ''), ${sql.raw(`'${DIGITS}'`)}, '', 'g'), ''),
	regexp_replace(COALESCE(c.tax_number, ''), ${sql.raw(`'${DIGITS}'`)}, '', 'g')
)`;
const OGRN = sql`COALESCE(
	NULLIF(regexp_replace(COALESCE(o.company_info_ogrn, ''), ${sql.raw(`'${DIGITS}'`)}, '', 'g'), ''),
	regexp_replace(COALESCE(c.ogrn, ''), ${sql.raw(`'${DIGITS}'`)}, '', 'g')
)`;

/**
 * Тип покупателя в заказе. Отдельного поля нет: организация в заказе есть или
 * её нет, а ИП от юрлица отличает длина реквизита — 12 цифр ИНН у ИП, 10 у
 * организации (то же правило в CompanySection и validate-inn). Если реквизиты
 * не разбираются, заказ не приписывается ни к одному из типов наугад.
 */
export const CUSTOMER_TYPE = sql`CASE
	WHEN o.company_info_company_id_id IS NULL
		AND NULLIF(trim(COALESCE(o.company_info_name, '')), '') IS NULL
		AND NULLIF(trim(COALESCE(o.company_info_tax_number, '')), '') IS NULL
		THEN 'individual'
	WHEN length(${INN}) = 12 OR length(${OGRN}) = 15 THEN 'sole_proprietor'
	WHEN length(${INN}) = 10 OR length(${OGRN}) = 13 THEN 'legal'
	ELSE 'company_unknown'
END`;

/**
 * Регион доставки. У самовывоза региона покупателя нет — есть только наш пункт
 * выдачи, поэтому он отдельным значением, а не городом пункта: иначе склад
 * выглядел бы самым активным регионом. Адрес старых заказов одной строкой в
 * `street` не разбирается: догадка неотличима от данных.
 */
const CLEAN_REGION = sql`NULLIF(trim(COALESCE(o.delivery_address_region, '')), '')`;

export const REGION_KEY = sql`CASE
	WHEN o.delivery_method::text = 'self_pickup' THEN ${sql.raw(`'${REGION_PICKUP}'`)}
	WHEN ${CLEAN_REGION} IS NOT NULL THEN lower(${CLEAN_REGION})
	ELSE ${sql.raw(`'${REGION_UNKNOWN}'`)}
END`;

/**
 * Город без типа: подсказки DaData пишут «г Калуга», ручной ввод — «Калуга», и
 * это один город. Сельские адреса заполняют settlement вместо city.
 */
export const CITY_LABEL = sql`NULLIF(trim(regexp_replace(
	COALESCE(
		NULLIF(trim(COALESCE(o.delivery_address_city, '')), ''),
		NULLIF(trim(COALESCE(o.delivery_address_settlement, '')), ''),
		''
	),
	${sql.raw(`'^(г\\.?|город)[[:space:]]+'`)}, '', 'i'
)), '')`;

function dimensionFilters(filters: AnalyticsFilters): SQL[] {
	const parts: SQL[] = [];
	if (filters.statuses) {
		const list = sql.join(
			filters.statuses.map((s) => sql`${s}`),
			sql`, `,
		);
		parts.push(sql`o.status::text IN (${list})`);
	}
	if (filters.customerType) {
		parts.push(sql`(${CUSTOMER_TYPE}) = ${filters.customerType}`);
	}
	if (filters.delivery) {
		parts.push(sql`o.delivery_method::text = ${filters.delivery}`);
	}
	if (filters.payment) {
		parts.push(sql`o.payment_method::text = ${filters.payment}`);
	}
	if (filters.paymentStatus) {
		parts.push(sql`o.payment_status::text = ${filters.paymentStatus}`);
	}
	if (filters.source) {
		parts.push(sql`o.source::text = ${filters.source}`);
	}
	if (filters.region) {
		parts.push(sql`(${REGION_KEY}) = ${filters.region}`);
	}
	if (filters.categoryId !== null) {
		parts.push(sql`EXISTS (
			SELECT 1 FROM orders_items fi
			JOIN products fp ON fp.id = fi.product_id
			WHERE fi._parent_id = o.id AND fp.category_id = ${filters.categoryId}
		)`);
	}
	return parts;
}

/**
 * Заказы отчёта подзапросом: алиас ставит вызывающий.
 *
 * `range = null` — без ограничения по дате (снимок «сейчас»).
 */
export function scopedOrders(
	filters: AnalyticsFilters,
	range: DateRange | null,
): SQL {
	const conditions: SQL[] = [...dimensionFilters(filters)];
	if (range) {
		conditions.push(sql`o.created_at >= ${dayStart(range.from)}`);
		conditions.push(sql`o.created_at < ${dayEndExclusive(range.to)}`);
	}
	const where = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	return sql`(
		SELECT
			o.id,
			o.order_number,
			o.user_id,
			o.status::text AS status,
			o.created_at,
			COALESCE(o.pricing_total, 0) AS total,
			COALESCE(o.pricing_subtotal, 0) AS subtotal,
			COALESCE(o.pricing_discount, 0) AS discount,
			COALESCE(o.pricing_shipping_cost, 0) AS shipping,
			COALESCE(o.pricing_promo_discount_amount, 0) AS promo_discount,
			o.promo_code_code AS promo_code,
			o.payment_method::text AS payment_method,
			o.payment_status::text AS payment_status,
			o.payment_paid_at,
			o.payment_invoice_file_id,
			o.delivery_method::text AS delivery_method,
			o.delivery_pickup_point_id,
			o.source::text AS source,
			${IS_VOID} AS is_void,
			${CUSTOMER_TYPE} AS customer_type,
			${REGION_KEY} AS region_key,
			${CLEAN_REGION} AS region_label,
			${CITY_LABEL} AS city_label,
			COALESCE(NULLIF(trim(COALESCE(o.company_info_name, '')), ''), c.company_name) AS company_name
		FROM orders o
		LEFT JOIN companies c ON c.id = o.company_info_company_id_id
		${where}
	)`;
}

/**
 * Позиции внутри фильтра по разделу: при выбранной категории товарные
 * показатели считаются только по её товарам. Ожидает товар под алиасом `p`.
 */
export function itemCategoryFilter(filters: AnalyticsFilters): SQL {
	return filters.categoryId === null
		? sql`TRUE`
		: sql`p.category_id = ${filters.categoryId}`;
}

/** Действующие заказы покупателей за всю историю, без фильтров отчёта. */
export const VALID_CUSTOMER_ORDERS = sql`(
	SELECT o.id, o.user_id, o.created_at, COALESCE(o.pricing_total, 0) AS total
	FROM orders o
	WHERE o.user_id IS NOT NULL AND NOT (${IS_VOID})
)`;
