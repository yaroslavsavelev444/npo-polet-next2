import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

// ВАЖНО: enum_account_deletion_requests_status, таблица account_deletion_requests,
// её FK на users и базовые индексы (subject_reference, user_id) уже созданы
// более ранней миграцией 20260710_085725 (см. её up()). Эта миграция изначально
// дублировала то создание (была написана вручную, без сопутствующего .json
// снапшота — отсюда и рассинхронизация) и падала в проде с "type ... already
// exists", потому что 085725 уже применена. Оставляем здесь только то, чего
// в 085725 действительно не было: составной индекс по (status, scheduled_for)
// и partial unique индекс, гарантирующий не более одной активной заявки на
// удаление аккаунта на пользователя.
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
    CREATE INDEX "account_deletion_requests_status_scheduled_idx"
      ON "account_deletion_requests" USING btree ("status", "scheduled_for");
    CREATE UNIQUE INDEX "account_deletion_requests_active_user_idx"
      ON "account_deletion_requests" USING btree ("user_id")
      WHERE "status" IN ('pending', 'executing');
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    DROP INDEX IF EXISTS "account_deletion_requests_active_user_idx";
    DROP INDEX IF EXISTS "account_deletion_requests_status_scheduled_idx";
  `);
}
