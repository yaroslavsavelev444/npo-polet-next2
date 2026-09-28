import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * КПП и ОГРН плательщика — для автозаполнения реквизитов по ИНН.
 *
 *   • companies.kpp / companies.ogrn — у сохранённой организации;
 *   • orders.company_info_kpp / orders.company_info_ogrn — в снимке
 *     реквизитов заказа (группа companyInfo): счёт выставляется по заказу,
 *     и реквизиты в нём не должны меняться вместе с карточкой организации.
 *
 * Колонки nullable без значения по умолчанию: существующие организации и
 * заказы заведены без этих данных, и выдумывать их нельзя. Индексы не
 * нужны — по КПП/ОГРН ничего не ищется.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
  ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "kpp" varchar;
  ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "ogrn" varchar;
  ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "company_info_kpp" varchar;
  ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "company_info_ogrn" varchar;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
  ALTER TABLE "orders" DROP COLUMN IF EXISTS "company_info_ogrn";
  ALTER TABLE "orders" DROP COLUMN IF EXISTS "company_info_kpp";
  ALTER TABLE "companies" DROP COLUMN IF EXISTS "ogrn";
  ALTER TABLE "companies" DROP COLUMN IF EXISTS "kpp";`);
}
