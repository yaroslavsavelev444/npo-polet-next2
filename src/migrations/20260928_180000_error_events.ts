import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Сбор серверных ошибок и оповещение дежурного
 * (src/services/observability/README.md).
 *
 *   • error_events — журнал ошибок (src/payload/collections/ErrorEvents.ts).
 *     Колонки raw_* — «сырая» половина с персональными данными: в список
 *     админки и в письма они не попадают. Индексы — под три сценария чтения:
 *     карточка по errorId из письма (уникальный), все случаи одной ошибки
 *     (fingerprint), лента и суточная сводка/очистка по времени (occurred_at).
 *
 *   • alerting_settings — глобал «Оповещения об ошибках»
 *     (src/payload/globals/AlertingSettings.ts). Строки нет до первого
 *     сохранения — код читает отсутствующие поля как умолчания.
 *
 * Написана руками — см. шапку 20260922_120000_trusted_devices.ts.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		DO $$ BEGIN
			CREATE TYPE "public"."enum_error_events_severity" AS ENUM('fatal', 'error', 'warning');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		CREATE TABLE IF NOT EXISTS "error_events" (
			"id" serial PRIMARY KEY NOT NULL,
			"occurred_at" timestamp(3) with time zone NOT NULL,
			"severity" "enum_error_events_severity" NOT NULL,
			"error_name" varchar NOT NULL,
			"message" varchar NOT NULL,
			"code" varchar,
			"source" varchar NOT NULL,
			"module" varchar,
			"frames" varchar,
			"causes" varchar,
			"http_method" varchar,
			"http_route" varchar,
			"http_status" numeric,
			"job_queue" varchar,
			"job_name" varchar,
			"job_attempt" varchar,
			"user_ref" varchar,
			"process_name" varchar NOT NULL,
			"hostname" varchar NOT NULL,
			"environment" varchar NOT NULL,
			"error_id" varchar NOT NULL,
			"fingerprint" varchar NOT NULL,
			"notified_sent" boolean,
			"notified_reason" varchar,
			"raw_message" varchar,
			"raw_causes" varchar,
			"raw_stack" varchar,
			"raw_path" varchar,
			"raw_user_id" varchar,
			"raw_ip" varchar,
			"raw_user_agent" varchar,
			"raw_extra" jsonb,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);

		CREATE UNIQUE INDEX IF NOT EXISTS "error_events_error_id_idx"
			ON "error_events" USING btree ("error_id");
		CREATE INDEX IF NOT EXISTS "error_events_fingerprint_idx"
			ON "error_events" USING btree ("fingerprint");
		CREATE INDEX IF NOT EXISTS "error_events_occurred_at_idx"
			ON "error_events" USING btree ("occurred_at");
		CREATE INDEX IF NOT EXISTS "error_events_updated_at_idx"
			ON "error_events" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "error_events_created_at_idx"
			ON "error_events" USING btree ("created_at");
	`);

	// Блокировки документов в админке: колонка на каждую коллекцию.
	await db.execute(sql`
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "error_events_id" integer;
		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_error_events_fk"
				FOREIGN KEY ("error_events_id") REFERENCES "public"."error_events"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_error_events_id_idx"
			ON "payload_locked_documents_rels" USING btree ("error_events_id");
	`);

	await db.execute(sql`
		DO $$ BEGIN
			CREATE TYPE "public"."enum_alerting_settings_severity_threshold" AS ENUM('fatal', 'error', 'warning');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		CREATE TABLE IF NOT EXISTS "alerting_settings" (
			"id" serial PRIMARY KEY NOT NULL,
			"email_enabled" boolean DEFAULT true,
			"severity_threshold" "enum_alerting_settings_severity_threshold" DEFAULT 'error',
			"daily_digest" boolean DEFAULT true,
			"warnings_enabled" boolean DEFAULT false,
			"warnings_modules" varchar,
			"cooldown_base_seconds" numeric DEFAULT 60,
			"cooldown_max_seconds" numeric DEFAULT 21600,
			"cooldown_reset_seconds" numeric DEFAULT 21600,
			"max_messages_per_hour" numeric DEFAULT 20,
			"burst_escalation" boolean DEFAULT true,
			"updated_at" timestamp(3) with time zone,
			"created_at" timestamp(3) with time zone
		);
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		DROP TABLE IF EXISTS "alerting_settings";
		DROP TYPE IF EXISTS "public"."enum_alerting_settings_severity_threshold";

		ALTER TABLE "payload_locked_documents_rels"
			DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_error_events_fk";
		DROP INDEX IF EXISTS "payload_locked_documents_rels_error_events_id_idx";
		ALTER TABLE "payload_locked_documents_rels"
			DROP COLUMN IF EXISTS "error_events_id";

		DROP TABLE IF EXISTS "error_events" CASCADE;
		DROP TYPE IF EXISTS "public"."enum_error_events_severity";
	`);
}
