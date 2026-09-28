import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Недоступный товар перестаёт быть тупиком.
 *
 *   • restock_subscriptions — «Сообщить о поступлении» (см.
 *     src/payload/collections/RestockSubscriptions.ts). Уникальный индекс на
 *     (user_id, product_id) — это и есть идемпотентность подписки: повторное
 *     нажатие упирается в ON CONFLICT DO NOTHING. Имя индекса `user_product_idx`
 *     — то, что Payload выводит из `indexes: [{ fields: ["user", "product"] }]`
 *     (ср. `user_banner_idx` у banner_states).
 *
 *     Внешние ключи — ON DELETE CASCADE, а не set null, как Payload оформляет
 *     связи по умолчанию: обе колонки NOT NULL, и set null превратил бы
 *     удаление пользователя или товара в ошибку ограничения. Подписка без
 *     пользователя или без товара смысла не имеет.
 *
 *   • contact_requests — заявка на товар: тема 'product', связь с товаром,
 *     количество и аккаунт отправителя. email и message становятся
 *     nullable: у заявки на товар их нет, обязательность для прочих тем
 *     проверяет validate в коллекции.
 *
 * Уведомления о поступлении используют уже существующий тип 'product' у
 * notifications — новых значений enum там не нужно.
 *
 * Написана руками — см. шапку 20260922_120000_trusted_devices.ts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS "restock_subscriptions" (
			"id" serial PRIMARY KEY NOT NULL,
			"user_id" integer NOT NULL,
			"product_id" integer NOT NULL,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);
	`);

	await db.execute(sql`
		DO $$ BEGIN
			ALTER TABLE "restock_subscriptions" ADD CONSTRAINT "restock_subscriptions_user_id_users_id_fk"
				FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "restock_subscriptions" ADD CONSTRAINT "restock_subscriptions_product_id_products_id_fk"
				FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		CREATE UNIQUE INDEX IF NOT EXISTS "user_product_idx"
			ON "restock_subscriptions" USING btree ("user_id", "product_id");
		CREATE INDEX IF NOT EXISTS "restock_subscriptions_user_idx"
			ON "restock_subscriptions" USING btree ("user_id");
		CREATE INDEX IF NOT EXISTS "restock_subscriptions_product_idx"
			ON "restock_subscriptions" USING btree ("product_id");
		CREATE INDEX IF NOT EXISTS "restock_subscriptions_updated_at_idx"
			ON "restock_subscriptions" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "restock_subscriptions_created_at_idx"
			ON "restock_subscriptions" USING btree ("created_at");
	`);

	// Блокировки документов в админке: колонка на каждую коллекцию.
	await db.execute(sql`
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "restock_subscriptions_id" integer;
		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_restock_subscriptions_fk"
				FOREIGN KEY ("restock_subscriptions_id") REFERENCES "public"."restock_subscriptions"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_restock_subscriptions_id_idx"
			ON "payload_locked_documents_rels" USING btree ("restock_subscriptions_id");
	`);

	await db.execute(sql`
		ALTER TYPE "public"."enum_contact_requests_topic" ADD VALUE IF NOT EXISTS 'product';

		ALTER TABLE "contact_requests" ALTER COLUMN "email" DROP NOT NULL;
		ALTER TABLE "contact_requests" ALTER COLUMN "message" DROP NOT NULL;
		ALTER TABLE "contact_requests" ADD COLUMN IF NOT EXISTS "product_id" integer;
		ALTER TABLE "contact_requests" ADD COLUMN IF NOT EXISTS "quantity" numeric;
		ALTER TABLE "contact_requests" ADD COLUMN IF NOT EXISTS "user_id" integer;

		DO $$ BEGIN
			ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_product_id_products_id_fk"
				FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_user_id_users_id_fk"
				FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		CREATE INDEX IF NOT EXISTS "contact_requests_product_idx"
			ON "contact_requests" USING btree ("product_id");
		CREATE INDEX IF NOT EXISTS "contact_requests_user_idx"
			ON "contact_requests" USING btree ("user_id");
	`);
}

/**
 * Откат. Заявки на товар удаляются: без колонки товара и с обязательными
 * email/сообщением им в таблице не место. Значение 'product' остаётся в enum —
 * PostgreSQL не умеет удалять значения перечисления, а лишнее значение ничему
 * не мешает.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		DELETE FROM "contact_requests" WHERE "topic" = 'product';
		DROP INDEX IF EXISTS "contact_requests_user_idx";
		DROP INDEX IF EXISTS "contact_requests_product_idx";
		ALTER TABLE "contact_requests" DROP CONSTRAINT IF EXISTS "contact_requests_user_id_users_id_fk";
		ALTER TABLE "contact_requests" DROP CONSTRAINT IF EXISTS "contact_requests_product_id_products_id_fk";
		ALTER TABLE "contact_requests" DROP COLUMN IF EXISTS "user_id";
		ALTER TABLE "contact_requests" DROP COLUMN IF EXISTS "quantity";
		ALTER TABLE "contact_requests" DROP COLUMN IF EXISTS "product_id";
		ALTER TABLE "contact_requests" ALTER COLUMN "message" SET NOT NULL;
		ALTER TABLE "contact_requests" ALTER COLUMN "email" SET NOT NULL;

		ALTER TABLE "payload_locked_documents_rels"
			DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_restock_subscriptions_fk";
		ALTER TABLE "payload_locked_documents_rels"
			DROP COLUMN IF EXISTS "restock_subscriptions_id";

		DROP TABLE IF EXISTS "restock_subscriptions" CASCADE;
	`);
}
