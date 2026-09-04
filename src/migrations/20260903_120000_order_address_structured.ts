import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Структурированный адрес доставки: канонический адрес одной строкой,
 * дополнительные компоненты (регион, район, населённый пункт, корпус),
 * данные для курьера (подъезд, этаж) и справочные идентификаторы ФИАС/КЛАДР,
 * которые приходят из подсказок адреса.
 *
 * Миграция ТОЛЬКО расширяет схему. Данные существующих заказов не трогаются
 * и не переносятся — и это осознанное решение, а не экономия:
 *
 *  1. Все новые колонки nullable. Исторический заказ, у которого адрес лежит
 *     одной строкой в `delivery_address_street`, читается ровно как читался;
 *     новые колонки у него NULL и никем не требуются (см. checkout-schema:
 *     обязательность полей проверяется только при ОФОРМЛЕНИИ нового заказа).
 *  2. Обратный перенос данных невозможен без потерь. Разобрать историческую
 *     строку адреса на регион/город/улицу/дом можно только через тот же
 *     сервис подсказок — то есть по сетевому запросу на каждый заказ, с
 *     неизбежными ошибками разбора и без возможности их проверить. Ошибочно
 *     разобранный адрес в уже отгруженном заказе хуже, чем неразобранный:
 *     он выглядит достоверным.
 *  3. Заполнять `full_address` копией собранной строки тоже не нужно —
 *     отображение (lib/address.formatAddress) собирает её на лету, когда
 *     `full_address` пуст, и результат для старых заказов идентичен тому, что
 *     показывался до этой миграции.
 *
 * Поэтому в базе штатно сосуществуют три поколения адресов, и код чтения
 * рассчитан на все три.
 */

/** Одинаковый набор колонок в заказах и в сохранённых предпочтениях. */
const ADDRESS_COLUMNS = [
	["full_address", "varchar"],
	["region", "varchar"],
	["area", "varchar"],
	["settlement", "varchar"],
	["block", "varchar"],
	["entrance", "varchar"],
	["floor", "varchar"],
	["fias_id", "varchar"],
	["fias_level", "varchar"],
	["kladr_id", "varchar"],
	["geo_lat", "varchar"],
	["geo_lon", "varchar"],
	["qc_geo", "varchar"],
] as const;

const TABLES = ["orders", "checkout_preferences"] as const;

export async function up({ db }: MigrateUpArgs): Promise<void> {
	for (const table of TABLES) {
		for (const [column, type] of ADDRESS_COLUMNS) {
			await db.execute(
				sql.raw(
					`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "delivery_address_${column}" ${type};`,
				),
			);
		}
	}

	// `source` — enum Payload'а для select-поля. Создаём тип отдельно, потому
	// что CREATE TYPE не поддерживает IF NOT EXISTS во всех поддерживаемых
	// версиях PostgreSQL.
	await db.execute(sql`
		DO $$ BEGIN
			CREATE TYPE "public"."enum_orders_delivery_address_source" AS ENUM('dadata', 'manual');
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;

		DO $$ BEGIN
			CREATE TYPE "public"."enum_checkout_preferences_delivery_address_source" AS ENUM('dadata', 'manual');
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;
	`);

	await db.execute(sql`
		ALTER TABLE "orders"
			ADD COLUMN IF NOT EXISTS "delivery_address_source" "public"."enum_orders_delivery_address_source";
		ALTER TABLE "checkout_preferences"
			ADD COLUMN IF NOT EXISTS "delivery_address_source" "public"."enum_checkout_preferences_delivery_address_source";
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	for (const table of TABLES) {
		for (const [column] of ADDRESS_COLUMNS) {
			await db.execute(
				sql.raw(
					`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "delivery_address_${column}";`,
				),
			);
		}
		await db.execute(
			sql.raw(
				`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "delivery_address_source";`,
			),
		);
	}

	await db.execute(sql`
		DROP TYPE IF EXISTS "public"."enum_orders_delivery_address_source";
		DROP TYPE IF EXISTS "public"."enum_checkout_preferences_delivery_address_source";
	`);
}
