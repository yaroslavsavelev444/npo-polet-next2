import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Снимает btree-индексы с плоского текста статьи базы знаний (searchText).
 *
 * btree принимает строку не длиннее ~2,7 КБ после сжатия. Плоский текст
 * руководства с таблицами характеристик это превышает, и такая статья не
 * сохранялась ни из админки, ни скриптом: «index row size exceeds btree
 * version 4 maximum 2704». Поиск по полю идёт через GIN-индекс
 * knowledge_topics_search_fts_idx, а равенством по нему не ищут — индексы
 * были чистым балластом.
 *
 * down() возвращает индексы как были, но на базе, где уже есть длинная
 * статья, CREATE INDEX упадёт на той же ошибке — откат осмысленен только до
 * появления таких статей.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
  DROP INDEX IF EXISTS "knowledge_topics_search_text_idx";
  DROP INDEX IF EXISTS "_knowledge_topics_v_version_version_search_text_idx";`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
  CREATE INDEX IF NOT EXISTS "knowledge_topics_search_text_idx" ON "knowledge_topics" USING btree ("search_text");
  CREATE INDEX IF NOT EXISTS "_knowledge_topics_v_version_version_search_text_idx" ON "_knowledge_topics_v" USING btree ("version_search_text");`);
}
