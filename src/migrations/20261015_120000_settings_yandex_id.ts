import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Выключатель входа через Яндекс ID в «Настройках сайта» (группа
 * yandexId.enabled). DEFAULT false: после выкладки вход выключен, пока
 * владелец не включит его в админке.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
  ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "yandex_id_enabled" boolean DEFAULT false;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
  ALTER TABLE "settings" DROP COLUMN IF EXISTS "yandex_id_enabled";`);
}
