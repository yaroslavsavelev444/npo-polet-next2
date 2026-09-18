import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Документы блока «Доверие» на главной: массив в глобале «Настройки сайта».
 *
 * Массив в Payload — отдельная таблица со служебными `_order` и `_parent_id`
 * (порядок строк и ссылка на владельца); схема повторяет уже существующие
 * `settings_phones` / `settings_social_links`, а индекс на колонку загрузки
 * назван по тому же правилу, что `knowledge_topics_blocks_image_image_idx`.
 *
 * Имя enum'а задано в конфигурации поля явно (`home_document_source_enum`),
 * поэтому переименование поля не сможет разойтись с этой миграцией.
 *
 * IF NOT EXISTS / IF EXISTS — чтобы повторный прогон на частично
 * применённой базе не падал на первом же объекте.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
  DO $$ BEGIN
   CREATE TYPE "public"."home_document_source_enum" AS ENUM('file', 'url');
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE TABLE IF NOT EXISTS "settings_home_documents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"source_type" "home_document_source_enum" DEFAULT 'file' NOT NULL,
  	"file_id" integer,
  	"url" varchar,
  	"is_active" boolean DEFAULT true
  );

  DO $$ BEGIN
   ALTER TABLE "settings_home_documents" ADD CONSTRAINT "settings_home_documents_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  DO $$ BEGIN
   ALTER TABLE "settings_home_documents" ADD CONSTRAINT "settings_home_documents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;

  CREATE INDEX IF NOT EXISTS "settings_home_documents_order_idx" ON "settings_home_documents" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "settings_home_documents_parent_id_idx" ON "settings_home_documents" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "settings_home_documents_file_idx" ON "settings_home_documents" USING btree ("file_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
  DROP TABLE IF EXISTS "settings_home_documents" CASCADE;
  DROP TYPE IF EXISTS "public"."home_document_source_enum";`);
}
