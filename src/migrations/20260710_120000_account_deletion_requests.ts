import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
    CREATE TYPE "public"."enum_account_deletion_requests_status" AS ENUM (
      'pending', 'cancelled', 'executing', 'completed', 'failed'
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
      "retention_justification" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    ALTER TABLE "orders" ALTER COLUMN "user_id" DROP NOT NULL;
    ALTER TABLE "account_deletion_requests"
      ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "account_deletion_requests_subject_reference_idx"
      ON "account_deletion_requests" USING btree ("subject_reference");
    CREATE INDEX "account_deletion_requests_user_idx"
      ON "account_deletion_requests" USING btree ("user_id");
    CREATE INDEX "account_deletion_requests_status_scheduled_idx"
      ON "account_deletion_requests" USING btree ("status", "scheduled_for");
    CREATE UNIQUE INDEX "account_deletion_requests_active_user_idx"
      ON "account_deletion_requests" USING btree ("user_id")
      WHERE "status" IN ('pending', 'executing');
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    DROP INDEX IF EXISTS "account_deletion_requests_active_user_idx";
    DROP INDEX IF EXISTS "account_deletion_requests_status_scheduled_idx";
    DROP INDEX IF EXISTS "account_deletion_requests_user_idx";
    DROP INDEX IF EXISTS "account_deletion_requests_subject_reference_idx";
    ALTER TABLE "account_deletion_requests" DROP CONSTRAINT IF EXISTS "account_deletion_requests_user_id_users_id_fk";
    DROP TABLE IF EXISTS "account_deletion_requests";
    DROP TYPE IF EXISTS "public"."enum_account_deletion_requests_status";
    ALTER TABLE "orders" ALTER COLUMN "user_id" SET NOT NULL;
  `);
}
