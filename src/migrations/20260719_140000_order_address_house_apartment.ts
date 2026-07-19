import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Разбиение адреса доставки на отдельные поля: добавляем «дом» и «квартиру»
 * к группе delivery.address в заказах и в сохранённых предпочтениях оформления.
 *
 * Обратная совместимость: колонки nullable. Исторические заказы хранят весь
 * адрес в delivery_address_street — новые поля остаются NULL и не ломают
 * ни чтение (formatAddress переносит оба формата), ни выборки.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_address_house" varchar;
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_address_apartment" varchar;
		ALTER TABLE "checkout_preferences" ADD COLUMN IF NOT EXISTS "delivery_address_house" varchar;
		ALTER TABLE "checkout_preferences" ADD COLUMN IF NOT EXISTS "delivery_address_apartment" varchar;
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_address_house";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_address_apartment";
		ALTER TABLE "checkout_preferences" DROP COLUMN IF EXISTS "delivery_address_house";
		ALTER TABLE "checkout_preferences" DROP COLUMN IF EXISTS "delivery_address_apartment";
	`);
}
