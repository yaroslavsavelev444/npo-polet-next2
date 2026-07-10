import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_account_deletion_requests_status" AS ENUM('pending', 'cancelled', 'executing', 'completed', 'failed');

    CREATE TABLE "orders_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "users_id" integer,
      "admins_id" integer
    );

    CREATE TABLE "consents_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "admins_id" integer,
      "users_id" integer
    );

    CREATE TABLE "content_blocks_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "users_id" integer,
      "admins_id" integer
    );

    CREATE TABLE "account_deletion_requests" (
      "id" serial PRIMARY KEY NOT NULL,
      "user_id" integer,
      "subject_reference" varchar NOT NULL,
      "status" "enum_account_deletion_requests_status" DEFAULT 'pending' NOT NULL,
      "requested_at" timestamp(3) with time zone NOT NULL,
      "scheduled_for" timestamp(3) with time zone NOT NULL,
      "cancelled_at" timestamp(3) with time zone,
      "executed_at" timestamp(3) with time zone,
      "execution_lease_until" timestamp(3) with time zone,
      "execution_attempts" numeric DEFAULT 0,
      "last_error_code" varchar,
      "retention_justification" varchar DEFAULT 'Минимальный журнал исполнения права субъекта данных; персональные данные и связь с аккаунтом удаляются после завершения.' NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    -- Новые таблицы и связи
    ALTER TABLE "orders" ALTER COLUMN "user_id" DROP NOT NULL;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "account_deletion_requests_id" integer;

    -- Добавляем внешние ключи
    ALTER TABLE "orders_rels" ADD CONSTRAINT "orders_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "orders_rels" ADD CONSTRAINT "orders_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "orders_rels" ADD CONSTRAINT "orders_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "consents_rels" ADD CONSTRAINT "consents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "consents_rels" ADD CONSTRAINT "consents_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "consents_rels" ADD CONSTRAINT "consents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "content_blocks_rels" ADD CONSTRAINT "content_blocks_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."content_blocks"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "content_blocks_rels" ADD CONSTRAINT "content_blocks_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "content_blocks_rels" ADD CONSTRAINT "content_blocks_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

    -- Индексы
    CREATE INDEX "orders_rels_order_idx" ON "orders_rels" USING btree ("order");
    CREATE INDEX "orders_rels_parent_idx" ON "orders_rels" USING btree ("parent_id");
    CREATE INDEX "orders_rels_path_idx" ON "orders_rels" USING btree ("path");
    CREATE INDEX "orders_rels_users_id_idx" ON "orders_rels" USING btree ("users_id");
    CREATE INDEX "orders_rels_admins_id_idx" ON "orders_rels" USING btree ("admins_id");

    CREATE INDEX "consents_rels_order_idx" ON "consents_rels" USING btree ("order");
    CREATE INDEX "consents_rels_parent_idx" ON "consents_rels" USING btree ("parent_id");
    CREATE INDEX "consents_rels_path_idx" ON "consents_rels" USING btree ("path");
    CREATE INDEX "consents_rels_admins_id_idx" ON "consents_rels" USING btree ("admins_id");
    CREATE INDEX "consents_rels_users_id_idx" ON "consents_rels" USING btree ("users_id");

    CREATE INDEX "content_blocks_rels_order_idx" ON "content_blocks_rels" USING btree ("order");
    CREATE INDEX "content_blocks_rels_parent_idx" ON "content_blocks_rels" USING btree ("parent_id");
    CREATE INDEX "content_blocks_rels_path_idx" ON "content_blocks_rels" USING btree ("path");
    CREATE INDEX "content_blocks_rels_users_id_idx" ON "content_blocks_rels" USING btree ("users_id");
    CREATE INDEX "content_blocks_rels_admins_id_idx" ON "content_blocks_rels" USING btree ("admins_id");

    CREATE INDEX "account_deletion_requests_user_idx" ON "account_deletion_requests" USING btree ("user_id");
    CREATE INDEX "account_deletion_requests_subject_reference_idx" ON "account_deletion_requests" USING btree ("subject_reference");
    CREATE INDEX "account_deletion_requests_status_idx" ON "account_deletion_requests" USING btree ("status");
    CREATE INDEX "account_deletion_requests_requested_at_idx" ON "account_deletion_requests" USING btree ("requested_at");
    CREATE INDEX "account_deletion_requests_scheduled_for_idx" ON "account_deletion_requests" USING btree ("scheduled_for");
    CREATE INDEX "account_deletion_requests_updated_at_idx" ON "account_deletion_requests" USING btree ("updated_at");
    CREATE INDEX "account_deletion_requests_created_at_idx" ON "account_deletion_requests" USING btree ("created_at");

    ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "discounts" ADD CONSTRAINT "discounts_updated_by_id_admins_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;

    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_account_deletion_requests_fk" FOREIGN KEY ("account_deletion_requests_id") REFERENCES "public"."account_deletion_requests"("id") ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "payload_locked_documents_rels_account_deletion_requests__idx" ON "payload_locked_documents_rels" USING btree ("account_deletion_requests_id");
  `);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "orders_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "consents_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "content_blocks_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "account_deletion_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "orders_rels" CASCADE;
  DROP TABLE "consents_rels" CASCADE;
  DROP TABLE "content_blocks_rels" CASCADE;
  DROP TABLE "account_deletion_requests" CASCADE;
  ALTER TABLE "discounts" DROP CONSTRAINT "discounts_created_by_id_admins_id_fk";
  
  ALTER TABLE "discounts" DROP CONSTRAINT "discounts_updated_by_id_admins_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_account_deletion_requests_fk";
  
  DROP INDEX "payload_locked_documents_rels_account_deletion_requests__idx";
  ALTER TABLE "orders" ALTER COLUMN "user_id" SET NOT NULL;
  ALTER TABLE "orders_status_history" ADD COLUMN "changed_by_id" integer;
  ALTER TABLE "consents" ADD COLUMN "last_updated_by_id" integer;
  ALTER TABLE "content_blocks" ADD COLUMN "created_by_id" integer;
  ALTER TABLE "content_blocks" ADD COLUMN "updated_by_id" integer;
  ALTER TABLE "orders_status_history" ADD CONSTRAINT "orders_status_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consents" ADD CONSTRAINT "consents_last_updated_by_id_users_id_fk" FOREIGN KEY ("last_updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "discounts" ADD CONSTRAINT "discounts_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "content_blocks" ADD CONSTRAINT "content_blocks_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "orders_status_history_changed_by_idx" ON "orders_status_history" USING btree ("changed_by_id");
  CREATE INDEX "consents_last_updated_by_idx" ON "consents" USING btree ("last_updated_by_id");
  CREATE INDEX "content_blocks_created_by_idx" ON "content_blocks" USING btree ("created_by_id");
  CREATE INDEX "content_blocks_updated_by_idx" ON "content_blocks" USING btree ("updated_by_id");
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "account_deletion_requests_id";
  DROP TYPE "public"."enum_account_deletion_requests_status";`);
}
