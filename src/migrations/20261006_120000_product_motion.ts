import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Моушн-ролик на странице товара (группа products.motion).
 *
 *  - motion_enabled — показывать ли ролик под характеристиками;
 *  - motion_product — какой ролик из витрины главной (id изделия из
 *    showcase-content.ts). Тип общий для товара и его версий — задан
 *    enumName в конфигурации поля, как у inventory_status.
 *
 * Колонки версий (_products_v.version_*) добавляются, потому что Payload
 * пишет в версии те же поля. Значения по умолчанию — «не показывать»:
 * у существующих товаров ничего не меняется, пока ролик не включат.
 *
 * Список значений enum обязан совпадать с id в showcase-content.ts.
 * Добавили изделие в витрину — нужна миграция с ALTER TYPE … ADD VALUE.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."product_motion_enum" AS ENUM(
        'pauk-30bn', 'pauk-duplet', 'setkomet-fpv', 'setkomet-mavic', 'vultur-r10', 'triple'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "motion_enabled" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "motion_product" "product_motion_enum";
    ALTER TABLE "_products_v"
      ADD COLUMN IF NOT EXISTS "version_motion_enabled" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "version_motion_product" "product_motion_enum";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    ALTER TABLE "_products_v"
      DROP COLUMN IF EXISTS "version_motion_enabled",
      DROP COLUMN IF EXISTS "version_motion_product";
    ALTER TABLE "products"
      DROP COLUMN IF EXISTS "motion_enabled",
      DROP COLUMN IF EXISTS "motion_product";
    DROP TYPE IF EXISTS "public"."product_motion_enum";
  `);
}
