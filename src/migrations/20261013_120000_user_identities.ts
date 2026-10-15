import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Вход через Яндекс ID (src/modules/auth/oauth): привязки аккаунта к внешним
 * сервисам, флаг «пароль задан покупателем» и два новых типа одноразового
 * кода: link_oauth (привязка к существующему аккаунту) и account_delete
 * (удаление аккаунта, у которого нет пароля, — подтверждается кодом на почту).
 *
 * Операторы — вывод `scripts/schema-diff.mts` после добавления коллекции
 * user-identities, поля users.hasPassword и значения link_oauth, переписанный
 * в идемпотентном виде (IF NOT EXISTS, DO-блоки на типы и ограничения).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОТЛИЧИЯ ОТ ВЫВОДА PAYLOAD
 * ────────────────────────────────────────────────────────────────────────────
 *  • user_identities.user_id — ON DELETE CASCADE, а не set null: колонка
 *    NOT NULL, и set null превратил бы удаление пользователя в ошибку
 *    ограничения (так же в support_messages и restock_subscriptions).
 *    Сверка схемы покажет это как известный дрейф.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * has_password у всех существующих пользователей — true (DEFAULT при
 * добавлении колонки): до этой миграции аккаунт без пароля завести было нельзя.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	// ALTER TYPE … ADD VALUE нельзя выполнять в одной транзакции с
	// использованием нового значения; здесь оно не используется, а IF NOT
	// EXISTS делает оператор повторяемым.
	await db.execute(sql`
		ALTER TYPE "public"."enum_otp_codes_type" ADD VALUE IF NOT EXISTS 'link_oauth';
		ALTER TYPE "public"."enum_otp_codes_type" ADD VALUE IF NOT EXISTS 'account_delete';
	`);

	await db.execute(sql`
		DO $$ BEGIN
			CREATE TYPE "public"."enum_user_identities_provider" AS ENUM('yandex');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		CREATE TABLE IF NOT EXISTS "user_identities" (
			"id" serial PRIMARY KEY NOT NULL,
			"user_id" integer NOT NULL,
			"provider" "enum_user_identities_provider" NOT NULL,
			"subject" varchar NOT NULL,
			"email_at_link" varchar,
			"last_used_at" timestamp(3) with time zone,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);

		DO $$ BEGIN
			ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk"
				FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;

		CREATE INDEX IF NOT EXISTS "user_identities_user_idx" ON "user_identities" USING btree ("user_id");
		CREATE INDEX IF NOT EXISTS "user_identities_updated_at_idx" ON "user_identities" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "user_identities_created_at_idx" ON "user_identities" USING btree ("created_at");
		CREATE UNIQUE INDEX IF NOT EXISTS "provider_subject_idx" ON "user_identities" USING btree ("provider","subject");

		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "user_identities_id" integer;
		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_identities_fk"
				FOREIGN KEY ("user_identities_id") REFERENCES "public"."user_identities"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_user_identities_id_idx" ON "payload_locked_documents_rels" USING btree ("user_identities_id");

		ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "has_password" boolean DEFAULT true;
	`);
}

/**
 * Значения link_oauth и account_delete из enum_otp_codes_type не удаляются: Postgres не умеет
 * DROP VALUE, а пересоздание типа ради отката не стоит риска. Лишнее значение
 * ничему не мешает; коды этого типа удаляются.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		DELETE FROM "otp_codes" WHERE "type" IN ('link_oauth', 'account_delete');

		ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_user_identities_fk";
		DROP INDEX IF EXISTS "payload_locked_documents_rels_user_identities_id_idx";
		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "user_identities_id";

		DROP TABLE IF EXISTS "user_identities" CASCADE;
		DROP TYPE IF EXISTS "public"."enum_user_identities_provider";

		ALTER TABLE "users" DROP COLUMN IF EXISTS "has_password";
	`);
}
