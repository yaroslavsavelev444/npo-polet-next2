import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Модуль промокодов: две новые таблицы и снимок промокода в заказе.
 *
 * Миграция ТОЛЬКО расширяет схему — ни одна существующая строка не читается и
 * не переписывается:
 *
 *  1. `promo_codes` и `promo_code_redemptions` — новые таблицы. Коллекция
 *     `discounts` не затрагивается вовсе: промокоды намеренно сделаны
 *     отдельной сущностью, а не надстройкой над скидками (см.
 *     src/modules/promo/types.ts), поэтому и в базе они ничего не делят.
 *  2. Заказ получает `pricing_promo_discount_amount` и группу `promo_code_*`.
 *     Все колонки nullable/с DEFAULT 0: у исторических заказов промокода не
 *     было, и NULL/0 читается однозначно — «скидки по промокоду нет».
 *     Бэкфилл не нужен и был бы вреден: он выдумал бы промокод там, где его
 *     не существовало.
 *  3. `promo_code_redemptions.order_id` NULLABLE сознательно. Активация
 *     резервируется ДО создания заказа (см. reserveRedemption): иначе лимит
 *     проверялся бы уже после того, как заказ со скидкой записан, и
 *     последнюю активацию могли бы получить сразу двое.
 *
 * Все DDL идемпотентны (IF NOT EXISTS / DO $$ для типов): миграция
 * безопасно повторяется на частично обновлённой базе.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		DO $$ BEGIN
			CREATE TYPE "public"."enum_promo_codes_discount_type" AS ENUM('percentage', 'fixed');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			CREATE TYPE "public"."enum_promo_code_redemptions_status" AS ENUM('applied', 'revoked');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			CREATE TYPE "public"."enum_orders_promo_code_discount_type" AS ENUM('percentage', 'fixed');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
	`);

	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS "promo_codes" (
			"id" serial PRIMARY KEY NOT NULL,
			"code" varchar NOT NULL,
			"description" varchar,
			"discount_type" "enum_promo_codes_discount_type" DEFAULT 'percentage' NOT NULL,
			"discount_percent" numeric,
			"max_discount_amount" numeric,
			"fixed_amount" numeric,
			"min_order_amount" numeric,
			"combinable" boolean DEFAULT false,
			"is_active" boolean DEFAULT true,
			"start_at" timestamp(3) with time zone NOT NULL,
			"end_at" timestamp(3) with time zone,
			"max_uses" numeric,
			"max_uses_per_user" numeric,
			"applies_to_all_products" boolean DEFAULT true,
			"total_uses" numeric DEFAULT 0,
			"total_discount_amount" numeric DEFAULT 0,
			"created_by_id" integer,
			"updated_by_id" integer,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);

		CREATE TABLE IF NOT EXISTS "promo_codes_rels" (
			"id" serial PRIMARY KEY NOT NULL,
			"order" integer,
			"parent_id" integer NOT NULL,
			"path" varchar NOT NULL,
			"categories_id" integer,
			"products_id" integer
		);

		CREATE TABLE IF NOT EXISTS "promo_code_redemptions" (
			"id" serial PRIMARY KEY NOT NULL,
			"promo_code_id" integer NOT NULL,
			"code" varchar NOT NULL,
			"user_id" integer NOT NULL,
			"order_id" integer,
			"discount_amount" numeric NOT NULL,
			"status" "enum_promo_code_redemptions_status" DEFAULT 'applied' NOT NULL,
			"revoked_at" timestamp(3) with time zone,
			"revoke_reason" varchar,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);
	`);

	await db.execute(sql`
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "pricing_promo_discount_amount" numeric DEFAULT 0;
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promo_code_promo_code_id_id" integer;
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promo_code_code" varchar;
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promo_code_discount_type" "public"."enum_orders_promo_code_discount_type";
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promo_code_discount_percent" numeric;
		ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "promo_code_discount_amount" numeric;

		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "promo_codes_id" integer;
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "promo_code_redemptions_id" integer;
	`);

	// Внешние ключи. ON DELETE set null у ссылок из журнала и заказа —
	// удаление промокода не должно уносить с собой историю заказов: заказ
	// хранит собственную копию кода и суммы и остаётся полностью читаемым.
	await db.execute(sql`
		DO $$ BEGIN
			ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_updated_by_id_admins_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "promo_codes_rels" ADD CONSTRAINT "promo_codes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "promo_codes_rels" ADD CONSTRAINT "promo_codes_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "promo_codes_rels" ADD CONSTRAINT "promo_codes_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_promo_code_id_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_promo_code_id_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_promo_codes_fk" FOREIGN KEY ("promo_codes_id") REFERENCES "public"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_promo_code_redemptions_fk" FOREIGN KEY ("promo_code_redemptions_id") REFERENCES "public"."promo_code_redemptions"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
	`);

	// Уникальный индекс по коду — не только требование схемы Payload, но и
	// последняя линия защиты от двух промокодов с одинаковым кодом: код
	// ищется точным совпадением, и дубль сделал бы результат поиска
	// недетерминированным.
	//
	// Индексы (promo_code_id, user_id, status) и (order_id, status)
	// обслуживают горячие запросы модуля: подсчёт личных активаций при
	// проверке кода и возврат активаций при отмене заказа.
	await db.execute(sql`
		CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_code_idx" ON "promo_codes" USING btree ("code");
		CREATE INDEX IF NOT EXISTS "promo_codes_is_active_idx" ON "promo_codes" USING btree ("is_active");
		CREATE INDEX IF NOT EXISTS "promo_codes_created_by_idx" ON "promo_codes" USING btree ("created_by_id");
		CREATE INDEX IF NOT EXISTS "promo_codes_updated_by_idx" ON "promo_codes" USING btree ("updated_by_id");
		CREATE INDEX IF NOT EXISTS "promo_codes_updated_at_idx" ON "promo_codes" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "promo_codes_created_at_idx" ON "promo_codes" USING btree ("created_at");

		CREATE INDEX IF NOT EXISTS "promo_codes_rels_order_idx" ON "promo_codes_rels" USING btree ("order");
		CREATE INDEX IF NOT EXISTS "promo_codes_rels_parent_idx" ON "promo_codes_rels" USING btree ("parent_id");
		CREATE INDEX IF NOT EXISTS "promo_codes_rels_path_idx" ON "promo_codes_rels" USING btree ("path");
		CREATE INDEX IF NOT EXISTS "promo_codes_rels_categories_id_idx" ON "promo_codes_rels" USING btree ("categories_id");
		CREATE INDEX IF NOT EXISTS "promo_codes_rels_products_id_idx" ON "promo_codes_rels" USING btree ("products_id");

		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_promo_code_idx" ON "promo_code_redemptions" USING btree ("promo_code_id");
		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_code_idx" ON "promo_code_redemptions" USING btree ("code");
		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_user_idx" ON "promo_code_redemptions" USING btree ("user_id");
		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_order_idx" ON "promo_code_redemptions" USING btree ("order_id");
		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_status_idx" ON "promo_code_redemptions" USING btree ("status");
		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_updated_at_idx" ON "promo_code_redemptions" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_created_at_idx" ON "promo_code_redemptions" USING btree ("created_at");

		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_user_status_idx" ON "promo_code_redemptions" USING btree ("promo_code_id", "user_id", "status");
		CREATE INDEX IF NOT EXISTS "promo_code_redemptions_order_status_idx" ON "promo_code_redemptions" USING btree ("order_id", "status");

		CREATE INDEX IF NOT EXISTS "orders_promo_code_promo_code_promo_code_id_idx" ON "orders" USING btree ("promo_code_promo_code_id_id");
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_promo_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("promo_codes_id");
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_promo_code_redemptions_id_idx" ON "payload_locked_documents_rels" USING btree ("promo_code_redemptions_id");
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	// Откат удаляет ТОЛЬКО то, что добавила эта миграция. Заказы при этом
	// теряют снимок промокода — это неизбежно и честно: без таблицы промокодов
	// хранить ссылку на неё негде.
	await db.execute(sql`
		DROP TABLE IF EXISTS "promo_code_redemptions" CASCADE;
		DROP TABLE IF EXISTS "promo_codes_rels" CASCADE;
		DROP TABLE IF EXISTS "promo_codes" CASCADE;
	`);

	await db.execute(sql`
		DROP INDEX IF EXISTS "orders_promo_code_promo_code_promo_code_id_idx";
		DROP INDEX IF EXISTS "payload_locked_documents_rels_promo_codes_id_idx";
		DROP INDEX IF EXISTS "payload_locked_documents_rels_promo_code_redemptions_id_idx";

		ALTER TABLE "orders" DROP COLUMN IF EXISTS "pricing_promo_discount_amount";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "promo_code_promo_code_id_id";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "promo_code_code";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "promo_code_discount_type";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "promo_code_discount_percent";
		ALTER TABLE "orders" DROP COLUMN IF EXISTS "promo_code_discount_amount";

		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "promo_codes_id";
		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "promo_code_redemptions_id";
	`);

	await db.execute(sql`
		DROP TYPE IF EXISTS "public"."enum_orders_promo_code_discount_type";
		DROP TYPE IF EXISTS "public"."enum_promo_code_redemptions_status";
		DROP TYPE IF EXISTS "public"."enum_promo_codes_discount_type";
	`);
}
