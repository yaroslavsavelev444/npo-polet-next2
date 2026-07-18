import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Упрощение коллекции feedbacks (см. payload/collections/Feedbacks.ts).
 *
 * Оставляем: type, title, description, user_email, status, user_agent,
 * created_at/updated_at. Удаляем всё остальное (приоритет, привязка к
 * профилю/назначению, теги, вложения, заметки, голоса, дубликаты, IP,
 * расширенный deviceInfo). Тип обращения расширен до 6 категорий, статус
 * сокращён до 3 (new/in_progress/resolved). На момент миграции в таблице
 * 0 строк, поэтому приведение enum-типов безопасно.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
    -- 1. Зависимые таблицы (relationships / arrays)
    DROP TABLE IF EXISTS "feedbacks_rels" CASCADE;
    DROP TABLE IF EXISTS "feedbacks_tags" CASCADE;
    DROP TABLE IF EXISTS "feedbacks_internal_notes" CASCADE;

    -- 2. deviceInfo.userAgent → плоское поле user_agent (сохраняем данные)
    ALTER TABLE "feedbacks" RENAME COLUMN "device_info_user_agent" TO "user_agent";

    -- 3. Лишние колонки (индексы и FK уходят каскадом вместе с колонками)
    ALTER TABLE "feedbacks"
      DROP COLUMN IF EXISTS "priority",
      DROP COLUMN IF EXISTS "user_id",
      DROP COLUMN IF EXISTS "user_name",
      DROP COLUMN IF EXISTS "user_role",
      DROP COLUMN IF EXISTS "assigned_to_id",
      DROP COLUMN IF EXISTS "view_count",
      DROP COLUMN IF EXISTS "upvotes",
      DROP COLUMN IF EXISTS "duplicate_of_id",
      DROP COLUMN IF EXISTS "resolved_at",
      DROP COLUMN IF EXISTS "closed_at",
      DROP COLUMN IF EXISTS "due_date",
      DROP COLUMN IF EXISTS "device_info_platform",
      DROP COLUMN IF EXISTS "device_info_os",
      DROP COLUMN IF EXISTS "device_info_browser",
      DROP COLUMN IF EXISTS "device_info_screen_resolution",
      DROP COLUMN IF EXISTS "ip_address";

    -- 4. Ставшие ненужными enum-типы
    DROP TYPE IF EXISTS "enum_feedbacks_priority";
    DROP TYPE IF EXISTS "enum_feedbacks_user_role";

    -- 5. Пересоздаём enum типа обращения (6 категорий)
    ALTER TABLE "feedbacks" ALTER COLUMN "type" TYPE text;
    DROP TYPE "enum_feedbacks_type";
    CREATE TYPE "enum_feedbacks_type" AS ENUM('bug','improvement','question','order_issue','account_issue','other');
    ALTER TABLE "feedbacks" ALTER COLUMN "type" TYPE "enum_feedbacks_type" USING "type"::"enum_feedbacks_type";

    -- 6. Пересоздаём enum статуса (3 значения)
    ALTER TABLE "feedbacks" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "feedbacks" ALTER COLUMN "status" TYPE text;
    DROP TYPE "enum_feedbacks_status";
    CREATE TYPE "enum_feedbacks_status" AS ENUM('new','in_progress','resolved');
    ALTER TABLE "feedbacks" ALTER COLUMN "status" TYPE "enum_feedbacks_status" USING "status"::"enum_feedbacks_status";
    ALTER TABLE "feedbacks" ALTER COLUMN "status" SET DEFAULT 'new';

    -- 7. Email для связи теперь обязателен
    ALTER TABLE "feedbacks" ALTER COLUMN "user_email" SET NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    -- 7. Email снова необязателен
    ALTER TABLE "feedbacks" ALTER COLUMN "user_email" DROP NOT NULL;

    -- 6. Возвращаем прежний набор статусов
    ALTER TABLE "feedbacks" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "feedbacks" ALTER COLUMN "status" TYPE text;
    DROP TYPE "enum_feedbacks_status";
    CREATE TYPE "enum_feedbacks_status" AS ENUM('new','in_progress','resolved','closed','duplicate','wont_fix');
    ALTER TABLE "feedbacks" ALTER COLUMN "status" TYPE "enum_feedbacks_status" USING "status"::"enum_feedbacks_status";
    ALTER TABLE "feedbacks" ALTER COLUMN "status" SET DEFAULT 'new';

    -- 5. Возвращаем прежний набор типов
    ALTER TABLE "feedbacks" ALTER COLUMN "type" TYPE text;
    DROP TYPE "enum_feedbacks_type";
    CREATE TYPE "enum_feedbacks_type" AS ENUM('bug','improvement','feature','other');
    ALTER TABLE "feedbacks" ALTER COLUMN "type" TYPE "enum_feedbacks_type" USING "type"::"enum_feedbacks_type";

    -- 4. Восстанавливаем enum-типы
    CREATE TYPE "enum_feedbacks_priority" AS ENUM('low','medium','high','critical');
    CREATE TYPE "enum_feedbacks_user_role" AS ENUM('user','lawyer','admin','moderator');

    -- 3. Возвращаем удалённые колонки (nullable, как было)
    ALTER TABLE "feedbacks"
      ADD COLUMN "priority" "enum_feedbacks_priority" DEFAULT 'low',
      ADD COLUMN "user_id" integer,
      ADD COLUMN "user_name" varchar,
      ADD COLUMN "user_role" "enum_feedbacks_user_role",
      ADD COLUMN "assigned_to_id" integer,
      ADD COLUMN "view_count" numeric DEFAULT 0,
      ADD COLUMN "upvotes" numeric DEFAULT 0,
      ADD COLUMN "duplicate_of_id" integer,
      ADD COLUMN "resolved_at" timestamp(3) with time zone,
      ADD COLUMN "closed_at" timestamp(3) with time zone,
      ADD COLUMN "due_date" timestamp(3) with time zone,
      ADD COLUMN "device_info_platform" varchar,
      ADD COLUMN "device_info_os" varchar,
      ADD COLUMN "device_info_browser" varchar,
      ADD COLUMN "device_info_screen_resolution" varchar,
      ADD COLUMN "ip_address" varchar;

    -- 2. user_agent → device_info_user_agent
    ALTER TABLE "feedbacks" RENAME COLUMN "user_agent" TO "device_info_user_agent";

    -- 1. Пересоздаём вспомогательные таблицы
    CREATE TABLE "feedbacks_tags" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "tag" varchar NOT NULL
    );
    ALTER TABLE "feedbacks_tags" ADD CONSTRAINT "feedbacks_tags_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "feedbacks"("id") ON DELETE CASCADE;
    CREATE INDEX "feedbacks_tags_order_idx" ON "feedbacks_tags" ("_order");
    CREATE INDEX "feedbacks_tags_parent_id_idx" ON "feedbacks_tags" ("_parent_id");

    CREATE TABLE "feedbacks_internal_notes" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "note" varchar NOT NULL,
      "created_by_id" integer,
      "created_at" timestamp(3) with time zone,
      "is_private" boolean DEFAULT false
    );
    ALTER TABLE "feedbacks_internal_notes" ADD CONSTRAINT "feedbacks_internal_notes_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "feedbacks"("id") ON DELETE CASCADE;
    CREATE INDEX "feedbacks_internal_notes_created_by_idx" ON "feedbacks_internal_notes" ("created_by_id");
    CREATE INDEX "feedbacks_internal_notes_order_idx" ON "feedbacks_internal_notes" ("_order");
    CREATE INDEX "feedbacks_internal_notes_parent_id_idx" ON "feedbacks_internal_notes" ("_parent_id");

    CREATE TABLE "feedbacks_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "media_id" integer,
      "users_id" integer,
      "feedbacks_id" integer
    );
    ALTER TABLE "feedbacks_rels" ADD CONSTRAINT "feedbacks_rels_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "feedbacks"("id") ON DELETE CASCADE;
    ALTER TABLE "feedbacks_rels" ADD CONSTRAINT "feedbacks_rels_feedbacks_fk"
      FOREIGN KEY ("feedbacks_id") REFERENCES "feedbacks"("id") ON DELETE CASCADE;
    CREATE INDEX "feedbacks_rels_order_idx" ON "feedbacks_rels" ("order");
    CREATE INDEX "feedbacks_rels_parent_idx" ON "feedbacks_rels" ("parent_id");
    CREATE INDEX "feedbacks_rels_path_idx" ON "feedbacks_rels" ("path");
    CREATE INDEX "feedbacks_rels_feedbacks_id_idx" ON "feedbacks_rels" ("feedbacks_id");
    CREATE INDEX "feedbacks_rels_media_id_idx" ON "feedbacks_rels" ("media_id");
    CREATE INDEX "feedbacks_rels_users_id_idx" ON "feedbacks_rels" ("users_id");
  `);
}
