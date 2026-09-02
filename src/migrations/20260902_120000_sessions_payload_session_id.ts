import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Связь записи коллекции `sessions` (витрина «Активные устройства») с
 * настоящей сессией Payload — claim `sid` в JWT и одноимённая строка в
 * `users_sessions`.
 *
 * Без этой связи отзыв сессии («выйти», «выйти со всех устройств», смена и
 * сброс пароля) менял только наш флаг `revoked` и не инвалидировал сам
 * payload-token: JWT-стратегия Payload сверяется исключительно с
 * `users_sessions` (см. src/modules/auth/lib/payloadSessions.ts).
 *
 * Колонка nullable: у сессий, созданных до этой миграции, привязки нет —
 * для них отзыв работает как раньше (плюс полный сброс `users_sessions`
 * пользователя при смене/сбросе пароля и выходе со всех устройств).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "payload_session_id" varchar;
		CREATE INDEX IF NOT EXISTS "sessions_payload_session_id_idx"
			ON "sessions" USING btree ("payload_session_id");
	`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		DROP INDEX IF EXISTS "sessions_payload_session_id_idx";
		ALTER TABLE "sessions" DROP COLUMN IF EXISTS "payload_session_id";
	`);
}
