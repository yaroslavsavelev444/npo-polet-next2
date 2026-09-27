import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * pg_trgm — исправление опечаток в поиске по товарам (см. search.service,
 * findProductsBySimilarity).
 *
 * Только расширение, без индексов: сравнение идёт по названиям каталога
 * (сотни строк) и лишь тогда, когда точных совпадений нет, — индекс на таком
 * объёме планировщик всё равно не выберет.
 *
 * pg_trgm входит в стандартную поставку Postgres и с 13-й версии помечено
 * как trusted: ставить его может владелец базы без прав суперпользователя.
 * Если прав всё же не хватило, миграция НЕ падает — поиск проверяет наличие
 * расширения сам и без него просто не исправляет опечатки. Ронять деплой
 * ради вспомогательной возможности было бы несоразмерно.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
  DO $$ BEGIN
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION
   WHEN insufficient_privilege THEN
    RAISE NOTICE 'pg_trgm не установлено: недостаточно прав. Поиск будет работать без исправления опечаток.';
  END $$;`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	// Расширение могли поставить и до этой миграции, и для других нужд —
	// удалять его при откате небезопасно. Откат ничего не делает сознательно.
	await db.execute(sql`SELECT 1;`);
}
