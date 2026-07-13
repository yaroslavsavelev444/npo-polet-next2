import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
   ALTER TYPE "public"."enum_orders_status_history_status" ADD VALUE 'packed' BEFORE 'shipped';
  ALTER TYPE "public"."enum_orders_status_history_status" ADD VALUE 'ready_for_pickup' BEFORE 'delivered';
  ALTER TYPE "public"."enum_orders_status_history_status" ADD VALUE 'awaiting_invoice';
  ALTER TYPE "public"."enum_orders_status" ADD VALUE 'packed' BEFORE 'shipped';
  ALTER TYPE "public"."enum_orders_status" ADD VALUE 'ready_for_pickup' BEFORE 'delivered';
  ALTER TYPE "public"."enum_orders_status" ADD VALUE 'awaiting_invoice';
  CREATE TABLE "faq_questions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"is_active" boolean DEFAULT true
  );
  
  CREATE TABLE "faq" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"order" numeric DEFAULT 0,
  	"is_active" boolean DEFAULT true,
  	"legacy_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "legacy_password_hash" varchar;
  ALTER TABLE "users" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "categories" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "products" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "_products_v" ADD COLUMN "version_legacy_id" varchar;
  ALTER TABLE "carts" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "orders" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "consents" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "pickup_points" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "transport_companies" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "discounts" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "companies" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "wishlists" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "user_consents" ADD COLUMN "legacy_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "faq_id" integer;
  ALTER TABLE "faq_questions" ADD CONSTRAINT "faq_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."faq"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "faq_questions_order_idx" ON "faq_questions" USING btree ("_order");
  CREATE INDEX "faq_questions_parent_id_idx" ON "faq_questions" USING btree ("_parent_id");
  CREATE INDEX "faq_order_idx" ON "faq" USING btree ("order");
  CREATE INDEX "faq_is_active_idx" ON "faq" USING btree ("is_active");
  CREATE UNIQUE INDEX "faq_legacy_id_idx" ON "faq" USING btree ("legacy_id");
  CREATE INDEX "faq_updated_at_idx" ON "faq" USING btree ("updated_at");
  CREATE INDEX "faq_created_at_idx" ON "faq" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faq_fk" FOREIGN KEY ("faq_id") REFERENCES "public"."faq"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "users_legacy_id_idx" ON "users" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "categories_legacy_id_idx" ON "categories" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "products_legacy_id_idx" ON "products" USING btree ("legacy_id");
  CREATE INDEX "_products_v_version_version_legacy_id_idx" ON "_products_v" USING btree ("version_legacy_id");
  CREATE UNIQUE INDEX "carts_legacy_id_idx" ON "carts" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "orders_legacy_id_idx" ON "orders" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "consents_legacy_id_idx" ON "consents" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "pickup_points_legacy_id_idx" ON "pickup_points" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "transport_companies_legacy_id_idx" ON "transport_companies" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "discounts_legacy_id_idx" ON "discounts" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "companies_legacy_id_idx" ON "companies" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "wishlists_legacy_id_idx" ON "wishlists" USING btree ("legacy_id");
  CREATE UNIQUE INDEX "user_consents_legacy_id_idx" ON "user_consents" USING btree ("legacy_id");
  CREATE INDEX "payload_locked_documents_rels_faq_id_idx" ON "payload_locked_documents_rels" USING btree ("faq_id");`);
}

export async function down({
	db,
	payload,
	req,
}: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
   ALTER TABLE "faq_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "faq" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "faq_questions" CASCADE;
  DROP TABLE "faq" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_faq_fk";
  
  ALTER TABLE "orders_status_history" ALTER COLUMN "status" SET DATA TYPE text;
  DROP TYPE "public"."enum_orders_status_history_status";
  CREATE TYPE "public"."enum_orders_status_history_status" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
  ALTER TABLE "orders_status_history" ALTER COLUMN "status" SET DATA TYPE "public"."enum_orders_status_history_status" USING "status"::"public"."enum_orders_status_history_status";
  ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
  DROP TYPE "public"."enum_orders_status";
  CREATE TYPE "public"."enum_orders_status" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded');
  ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."enum_orders_status";
  ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."enum_orders_status" USING "status"::"public"."enum_orders_status";
  DROP INDEX "users_legacy_id_idx";
  DROP INDEX "categories_legacy_id_idx";
  DROP INDEX "products_legacy_id_idx";
  DROP INDEX "_products_v_version_version_legacy_id_idx";
  DROP INDEX "carts_legacy_id_idx";
  DROP INDEX "orders_legacy_id_idx";
  DROP INDEX "consents_legacy_id_idx";
  DROP INDEX "pickup_points_legacy_id_idx";
  DROP INDEX "transport_companies_legacy_id_idx";
  DROP INDEX "discounts_legacy_id_idx";
  DROP INDEX "companies_legacy_id_idx";
  DROP INDEX "wishlists_legacy_id_idx";
  DROP INDEX "user_consents_legacy_id_idx";
  DROP INDEX "payload_locked_documents_rels_faq_id_idx";
  ALTER TABLE "users" DROP COLUMN "legacy_password_hash";
  ALTER TABLE "users" DROP COLUMN "legacy_id";
  ALTER TABLE "categories" DROP COLUMN "legacy_id";
  ALTER TABLE "products" DROP COLUMN "legacy_id";
  ALTER TABLE "_products_v" DROP COLUMN "version_legacy_id";
  ALTER TABLE "carts" DROP COLUMN "legacy_id";
  ALTER TABLE "orders" DROP COLUMN "legacy_id";
  ALTER TABLE "consents" DROP COLUMN "legacy_id";
  ALTER TABLE "pickup_points" DROP COLUMN "legacy_id";
  ALTER TABLE "transport_companies" DROP COLUMN "legacy_id";
  ALTER TABLE "discounts" DROP COLUMN "legacy_id";
  ALTER TABLE "companies" DROP COLUMN "legacy_id";
  ALTER TABLE "wishlists" DROP COLUMN "legacy_id";
  ALTER TABLE "user_consents" DROP COLUMN "legacy_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "faq_id";`);
}
