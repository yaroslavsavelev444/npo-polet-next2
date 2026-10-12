import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Запрет писать в чат поддержки для отдельного покупателя
 * (users.supportChatBanned) — точечная мера против спама, не трогающая
 * остальной аккаунт. Отдельной миграцией: 20261011_120000_support_chat к
 * этому моменту уже может быть применена.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "support_chat_banned" boolean DEFAULT false;
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "users" DROP COLUMN IF EXISTS "support_chat_banned";
	`);
}
