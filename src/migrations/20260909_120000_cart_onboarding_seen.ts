import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * `users.cart_onboarding_seen_at` — отметка о том, что пользователю уже
 * показали объяснение, где теперь находятся добавленные в корзину товары
 * (см. src/payload/collections/User.ts и modules/cart/CartOnboarding).
 *
 * NULL по умолчанию и у всех существующих строк: подсказка новая, значит её
 * не видел никто — включая тех, кто пользуется сайтом давно. Это осознанно:
 * корзина переехала в выдвижную панель, и объяснение полезно как раз тем,
 * кто привык к прежней странице.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cart_onboarding_seen_at" timestamp(3) with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    ALTER TABLE "users" DROP COLUMN IF EXISTS "cart_onboarding_seen_at";
  `);
}
