import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";
import {
	backfillCatalogKeys,
	backfillProductRatings,
} from "../payload/services/catalog-keys.db.ts";

/**
 * Фасетная фильтрация и сортировка каталога по рейтингу.
 *
 * 1. Нормализованные ключи характеристик — products_specifications
 *    (name_key, value_key, value_num, unit_key) и ключ производителя
 *    products.brand_manufacturer_key. Пишутся хуком товара
 *    (normalizeProductForCatalog); здесь — разовое заполнение для уже
 *    сохранённых товаров тем же кодом нормализации (catalog-keys.db.ts).
 *    Характеристики как были свободным текстом, так и остаются: ключи лежат
 *    рядом, ни одно существующее значение не меняется.
 *
 * 2. Денормализованный рейтинг — products.analytics_rating_average и
 *    analytics_reviews_count; заполняются из одобренных отзывов, дальше их
 *    ведёт хук отзывов (product-rating.db.ts).
 *
 * 3. Словарь фасетов раздела — коллекция catalog-facets (необязательная
 *    ручная настройка поверх автоматики). Изначально пуст.
 *
 * Колонки версий (_products_v_*) добавляются, потому что Payload пишет в
 * версии те же поля; заполнять их не нужно — выдача версии не читает.
 *
 * Индекс один: покрывающий products_specifications (_parent_id, name_key) —
 * см. комментарий у CREATE INDEX. Ни на products, ни на версии индексов не
 * добавляется: выдача всегда ограничена разделом (products_category_idx), а
 * сортировка сотен-тысяч строк раздела в памяти дешевле, чем поддержка
 * индекса на каждую сортировку.
 *
 * DDL снят с эталонной схемы (push конфигурации в пустую базу), имена
 * колонок и ограничений — ровно те, что ждёт Payload.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
    ALTER TABLE "products_specifications"
      ADD COLUMN IF NOT EXISTS "name_key" varchar,
      ADD COLUMN IF NOT EXISTS "value_key" varchar,
      ADD COLUMN IF NOT EXISTS "value_num" numeric,
      ADD COLUMN IF NOT EXISTS "unit_key" varchar;
    ALTER TABLE "_products_v_version_specifications"
      ADD COLUMN IF NOT EXISTS "name_key" varchar,
      ADD COLUMN IF NOT EXISTS "value_key" varchar,
      ADD COLUMN IF NOT EXISTS "value_num" numeric,
      ADD COLUMN IF NOT EXISTS "unit_key" varchar;
    ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "brand_manufacturer_key" varchar,
      ADD COLUMN IF NOT EXISTS "analytics_rating_average" numeric,
      ADD COLUMN IF NOT EXISTS "analytics_reviews_count" numeric DEFAULT 0;
    ALTER TABLE "_products_v"
      ADD COLUMN IF NOT EXISTS "version_brand_manufacturer_key" varchar,
      ADD COLUMN IF NOT EXISTS "version_analytics_rating_average" numeric,
      ADD COLUMN IF NOT EXISTS "version_analytics_reviews_count" numeric DEFAULT 0;
  `);

	// Фасетные условия и счётчики читают строки характеристик товаров ОДНОГО
	// раздела: «товар → его строки с нужными ключами». Ведущий _parent_id даёт
	// поиск строк товара, name_key — отсечение по ключу, а INCLUDE делает
	// индекс покрывающим (Index Only Scan без чтения таблицы). Без INCLUDE
	// планировщик считал выборку через индекс с походами в таблицу дороже
	// полного просмотра и сканировал всю таблицу характеристик на каждый
	// запрос: на синтетике 60 тыс. товаров / 900 тыс. строк раздел в 2 тыс.
	// товаров фильтровался за 100–230 мс, с этим индексом — за 15–35 мс.
	// Отдельный индекс Payload по _parent_id остаётся: он нужен выборке
	// массива и каскадному удалению.
	await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "products_specifications_facet_idx"
      ON "products_specifications" USING btree ("_parent_id", "name_key")
      INCLUDE ("value_key", "value_num", "unit_key", "is_visible")
      WHERE "name_key" IS NOT NULL;
  `);

	await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_catalog_facets_display" AS ENUM('auto', 'list', 'range', 'hidden');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE TABLE IF NOT EXISTS "catalog_facets" (
      "id" serial PRIMARY KEY NOT NULL,
      "category_id" integer NOT NULL,
      "label" varchar NOT NULL,
      "display" "enum_catalog_facets_display" DEFAULT 'auto',
      "unit" varchar,
      "group" varchar,
      "order" numeric DEFAULT 0,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "catalog_facets_aliases" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL
    );

    ALTER TABLE "catalog_facets"
      ADD CONSTRAINT "catalog_facets_category_id_categories_id_fk"
      FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id")
      ON DELETE set null ON UPDATE no action;
    ALTER TABLE "catalog_facets_aliases"
      ADD CONSTRAINT "catalog_facets_aliases_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."catalog_facets"("id")
      ON DELETE cascade ON UPDATE no action;

    CREATE INDEX IF NOT EXISTS "catalog_facets_category_idx" ON "catalog_facets" USING btree ("category_id");
    CREATE INDEX IF NOT EXISTS "catalog_facets_updated_at_idx" ON "catalog_facets" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "catalog_facets_created_at_idx" ON "catalog_facets" USING btree ("created_at");
    CREATE INDEX IF NOT EXISTS "catalog_facets_aliases_order_idx" ON "catalog_facets_aliases" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "catalog_facets_aliases_parent_id_idx" ON "catalog_facets_aliases" USING btree ("_parent_id");
  `);

	// Блокировки редактирования Payload — общая таблица связей, у каждой
	// коллекции своя колонка. Без неё админка падает при открытии записи.
	await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "catalog_facets_id" integer;
    ALTER TABLE "payload_locked_documents_rels"
      ADD CONSTRAINT "payload_locked_documents_rels_catalog_facets_fk"
      FOREIGN KEY ("catalog_facets_id") REFERENCES "public"."catalog_facets"("id")
      ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_catalog_facets_id_idx"
      ON "payload_locked_documents_rels" USING btree ("catalog_facets_id");
  `);

	await backfillCatalogKeys(db);
	await backfillProductRatings(db);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    DROP INDEX IF EXISTS "payload_locked_documents_rels_catalog_facets_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_catalog_facets_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "catalog_facets_id";

    DROP TABLE IF EXISTS "catalog_facets_aliases" CASCADE;
    DROP TABLE IF EXISTS "catalog_facets" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_catalog_facets_display";

    DROP INDEX IF EXISTS "products_specifications_facet_idx";

    ALTER TABLE "_products_v"
      DROP COLUMN IF EXISTS "version_brand_manufacturer_key",
      DROP COLUMN IF EXISTS "version_analytics_rating_average",
      DROP COLUMN IF EXISTS "version_analytics_reviews_count";
    ALTER TABLE "products"
      DROP COLUMN IF EXISTS "brand_manufacturer_key",
      DROP COLUMN IF EXISTS "analytics_rating_average",
      DROP COLUMN IF EXISTS "analytics_reviews_count";
    ALTER TABLE "_products_v_version_specifications"
      DROP COLUMN IF EXISTS "name_key",
      DROP COLUMN IF EXISTS "value_key",
      DROP COLUMN IF EXISTS "value_num",
      DROP COLUMN IF EXISTS "unit_key";
    ALTER TABLE "products_specifications"
      DROP COLUMN IF EXISTS "name_key",
      DROP COLUMN IF EXISTS "value_key",
      DROP COLUMN IF EXISTS "value_num",
      DROP COLUMN IF EXISTS "unit_key";
  `);
}
