import { sql } from "@payloadcms/db-postgres";
import type { Executor, SQL } from "../../support-chat/server/db.ts";
import { num, queryOne } from "../../support-chat/server/db.ts";

/**
 * Обезличивание заказов удалённого аккаунта — ОДИН список полей на удаление
 * аккаунта и на дочистку старых заказов (scripts/anonymize-deleted-orders.ts).
 *
 * Список вынесен, потому что однажды уже разошёлся со схемой: адресные колонки
 * добавила миграция 20260903_120000_order_address_structured, а запрос
 * обезличивания остался с четырьмя старыми. Полный адрес, квартира и координаты
 * пережили удаление аккаунта. Теперь `tests/account-deletion` читает колонки
 * `delivery_address_*` прямо из базы: новая адресная колонка без записи здесь
 * уронит тест.
 *
 * ─── Что намеренно остаётся ──────────────────────────────────────────────────
 *
 * • Номер, дата, статус, состав и суммы заказа — без них нет учёта.
 * • Реквизиты организации `company_info_*`, кроме контактного лица, и файл счёта:
 *   это первичные документы. Согласие обещает хранить документы по заказам не
 *   менее 5 лет независимо от отзыва согласия, основание — НК РФ и 402-ФЗ
 *   (цель 7 в src/modules/consents/RKN_NOTIFICATION.md). У ИП здесь есть ФИО и
 *   ИНН, но удалить их по заявке покупателя нельзя.
 * • Пункт самовывоза и транспортная компания: это наши справочники, а не данные
 *   покупателя.
 *
 * Регион тоже очищается, хотя статистике он был бы полезен: обещание пользователю
 * важнее, а в аналитике такие заказы честно попадают в «Регион не указан».
 */

/** Колонки заказа с данными покупателя и получателя: при обезличивании — NULL. */
export const ORDER_PERSONAL_COLUMNS = [
	"recipient_phone",
	"recipient_contact_person",
	"contact_phone",
	"contact_preferred",
	"contact_customer_phone",
	"delivery_address_full_address",
	"delivery_address_postal_code",
	"delivery_address_country",
	"delivery_address_region",
	"delivery_address_area",
	"delivery_address_city",
	"delivery_address_settlement",
	"delivery_address_street",
	"delivery_address_house",
	"delivery_address_block",
	"delivery_address_apartment",
	"delivery_address_entrance",
	"delivery_address_floor",
	"delivery_address_fias_id",
	"delivery_address_fias_level",
	"delivery_address_kladr_id",
	"delivery_address_geo_lat",
	"delivery_address_geo_lon",
	"delivery_address_qc_geo",
	"delivery_address_source",
	// По трек-номеру у перевозчика открываются адрес и получатель.
	"delivery_tracking_number",
	"delivery_notes",
	"company_info_contact_person",
	"notes",
	// Заметки менеджера пишутся свободным текстом и могут содержать что угодно.
	"internal_notes",
	"ip_address",
	"user_agent",
] as const;

const CLEAR_PERSONAL_COLUMNS = sql.raw(
	ORDER_PERSONAL_COLUMNS.map((column) => `${column} = NULL`).join(", "),
);

const HAS_PERSONAL_DATA = sql.raw(
	`num_nonnulls(${ORDER_PERSONAL_COLUMNS.map((column) => `o.${column}`).join(", ")}) > 0`,
);

/**
 * Заказ обезличен прошлым удалением аккаунта. Сравнение с адресом от собственного
 * id заказа, а не «нет покупателя»: заказы, перенесённые без владельца, тоже без
 * user_id, но они живые, и трогать их здесь нельзя.
 */
const IS_ANONYMIZED = sql`o.user_id IS NULL
	AND o.recipient_email = CONCAT('deleted-order-', o.id, '@example.invalid')`;

function clearHistoryComments(orders: SQL): SQL {
	// Причину отмены покупатель пишет свободным текстом: «заберёт сосед Иван,
	// телефон…». Сами записи истории (статус и время) остаются для учёта.
	return sql`UPDATE orders_status_history SET comment = NULL
		WHERE comment IS NOT NULL AND _parent_id IN (${orders})`;
}

/** Заказы удаляемого аккаунта. Вызывать в транзакции удаления, пока есть user_id. */
export async function anonymizeOrdersOfUser(
	db: Executor,
	userId: number,
): Promise<void> {
	await db.execute(
		clearHistoryComments(sql`SELECT id FROM orders WHERE user_id = ${userId}`),
	);
	await db.execute(sql`
		UPDATE orders
		SET user_id = NULL,
			recipient_full_name = 'Удалено по запросу субъекта данных',
			recipient_email = CONCAT('deleted-order-', id, '@example.invalid'),
			${CLEAR_PERSONAL_COLUMNS},
			updated_at = NOW()
		WHERE user_id = ${userId}
	`);
}

const ANONYMIZED_WITH_LEFTOVERS = sql`
	FROM orders o
	WHERE ${IS_ANONYMIZED} AND (
		${HAS_PERSONAL_DATA}
		OR EXISTS (
			SELECT 1 FROM orders_status_history h
			WHERE h._parent_id = o.id AND h.comment IS NOT NULL
		)
	)`;

/** Сколько уже обезличенных заказов всё ещё хранит данные покупателя. */
export async function countAnonymizedOrdersWithLeftovers(
	db: Executor,
): Promise<number> {
	const row = await queryOne(
		db,
		sql`SELECT COUNT(*) AS total ${ANONYMIZED_WITH_LEFTOVERS}`,
	);
	return num(row?.total);
}

/**
 * Дочистка заказов, обезличенных старой версией запроса. Повторный запуск ничего
 * не меняет. Необратимо, поэтому вызывается только вручную из скрипта.
 */
export async function scrubAnonymizedOrders(db: Executor): Promise<void> {
	await db.execute(
		clearHistoryComments(sql`SELECT o.id FROM orders o WHERE ${IS_ANONYMIZED}`),
	);
	await db.execute(sql`
		UPDATE orders AS o
		SET ${CLEAR_PERSONAL_COLUMNS}, updated_at = NOW()
		WHERE ${IS_ANONYMIZED} AND ${HAS_PERSONAL_DATA}
	`);
}
