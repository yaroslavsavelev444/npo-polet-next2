import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Заявки на 3D-печать с главной.
 *
 *   • contact_requests.topic — тема обращения: «Обращение» (форма на
 *     /contacts) или «3D-печать» (блок на главной). Все существующие записи
 *     получают 'general' — они пришли со страницы контактов.
 *   • contact_requests.phone — необязательный телефон: в заявке на печать
 *     его можно оставить, чтобы обсудить условия голосом.
 *   • settings.print_service_enabled — показывать ли блок на главной
 *     (группа printService.enabled в «Настройках сайта»).
 *
 * Имена — те, что Payload выводит из полей: enum_<таблица>_<поле>,
 * <группа>_<поле> в snake_case, индекс <таблица>_<поле>_idx.
 * IF NOT EXISTS — чтобы повторный прогон на частично применённой базе не
 * падал на первом объекте.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
  DO $$ BEGIN
   CREATE TYPE "public"."enum_contact_requests_topic" AS ENUM('general', 'print3d');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  ALTER TABLE "contact_requests"
    ADD COLUMN IF NOT EXISTS "topic" "enum_contact_requests_topic" DEFAULT 'general' NOT NULL;
  ALTER TABLE "contact_requests" ADD COLUMN IF NOT EXISTS "phone" varchar;
  CREATE INDEX IF NOT EXISTS "contact_requests_topic_idx" ON "contact_requests" USING btree ("topic");

  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "print_service_enabled" boolean DEFAULT true;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "print_service_enabled";
  DROP INDEX IF EXISTS "contact_requests_topic_idx";
  ALTER TABLE "contact_requests" DROP COLUMN IF EXISTS "phone";
  ALTER TABLE "contact_requests" DROP COLUMN IF EXISTS "topic";
  DROP TYPE IF EXISTS "public"."enum_contact_requests_topic";`);
}
