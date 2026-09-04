import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Разделение телефонов заказа: номер заказчика, номер получателя и явно
 * выбранный номер для связи.
 *
 * До этой миграции в заказе был один номер — `recipient_phone`, — и он же
 * использовался менеджером для звонка. Поскольку заказ часто оформляет не
 * тот человек, который его получает, звонок уходил получателю, который о
 * заказе мог не знать. Теперь номер для связи выбирает сам покупатель, и
 * заказ несёт этот выбор явно (см. modules/orders/lib/order-contact.ts).
 *
 * Миграция ТОЛЬКО расширяет схему; данные существующих заказов не трогаются:
 *
 *  1. Новые колонки nullable. У исторического заказа они NULL, и чтение
 *     трактует такой заказ однозначно — единственный известный номер лежит в
 *     `recipient_phone` и принадлежит получателю (resolveOrderContact).
 *     Поэтому «номер для связи» у старых заказов виден сразу, без бэкфилла.
 *  2. Проставлять `contact_customer_phone` копией `recipient_phone` НЕЛЬЗЯ:
 *     мы не знаем, чей это был номер. Именно эта догадка и была источником
 *     ошибочных звонков — повторять её в базе значило бы закрепить ошибку и
 *     сделать её неотличимой от достоверных данных.
 *  3. `recipient_phone` теряет NOT NULL: у новых заказов отдельный телефон
 *     получателя опционален. Существующие строки заполнены, ослабление
 *     ограничения их не затрагивает и не переписывает.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		DO $$ BEGIN
			CREATE TYPE "public"."enum_orders_contact_preferred" AS ENUM('customer', 'recipient');
		EXCEPTION
			WHEN duplicate_object THEN NULL;
		END $$;
	`);

	await db.execute(sql`
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "contact_phone" varchar;
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "contact_preferred" "public"."enum_orders_contact_preferred";
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "contact_customer_phone" varchar;
		ALTER TABLE "orders" ALTER COLUMN "recipient_phone" DROP NOT NULL;
	`);

	await db.execute(sql`
		CREATE INDEX IF NOT EXISTS "orders_contact_contact_phone_idx"
			ON "orders" USING btree ("contact_phone");
	`);

	// Сохранённые данные оформления: телефон заказчика запоминается наравне с
	// ФИО и email, иначе пользователь вводил бы собственный номер при каждом
	// заказе — в профиле он не хранится.
	await db.execute(sql`
		ALTER TABLE "checkout_preferences"
			ADD COLUMN IF NOT EXISTS "recipient_customer_phone" varchar;
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		DROP INDEX IF EXISTS "orders_contact_contact_phone_idx";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "contact_phone";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "contact_preferred";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "contact_customer_phone";
		ALTER TABLE "checkout_preferences" DROP COLUMN IF EXISTS "recipient_customer_phone";
	`);

	await db.execute(sql`
		DROP TYPE IF EXISTS "public"."enum_orders_contact_preferred";
	`);

	// NOT NULL возвращается только если в данных нет пустых значений: заказы,
	// оформленные без телефона получателя, откатом не удаляются.
	await db.execute(sql`
		UPDATE "orders" SET "recipient_phone" = '' WHERE "recipient_phone" IS NULL;
		ALTER TABLE "orders" ALTER COLUMN "recipient_phone" SET NOT NULL;
	`);
}
