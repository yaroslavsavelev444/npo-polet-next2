import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Доверенные устройства: браузеры, которым разрешён вход без одноразового кода.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НОВАЯ ТАБЛИЦА, А НЕ КОЛОНКИ В `sessions`
 * ────────────────────────────────────────────────────────────────────────────
 * Разбор — в шапке src/payload/collections/TrustedDevices.ts. Коротко: запись
 * сессии живёт 7 суток и отзывается при выходе, доверие живёт 90 суток и
 * выход переживает. Слитые в одну таблицу, эти два срока жизни начали бы
 * спорить в единственной колонке `revoked`.
 *
 * Связь с `sessions` при этом жёсткая — внешним ключом `session_id`: доверие
 * всегда указывает на вход, в котором было выдано или в последний раз
 * применено. `ON DELETE set null` — так же, как Payload оформляет все
 * необязательные связи: удаление старой сессии не должно уносить с собой
 * действующее доверие.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ МИГРАЦИЯ НАПИСАНА РУКАМИ
 * ────────────────────────────────────────────────────────────────────────────
 * По той же причине, что и все миграции после `20260904_153241_promo_codes`:
 * снимок схемы в `src/migrations/*.json` с тех пор не обновлялся, и
 * `payload migrate:create` выдал бы не диф этой задачи, а разницу с
 * полугодовой давностью вместе с интерактивными вопросами по чужим таблицам.
 *
 * Имена таблицы, колонок, индексов и ограничений — те, которые Payload
 * выводит из конфигурации коллекции (camelCase → snake_case, связь → `<имя>_id`,
 * enum → `enum_<таблица>_<поле>`). Расхождение здесь не безобидно: колонку с
 * другим именем Payload не найдёт вовсе, а индекс с «логичным», но другим
 * именем попытается создать заново при следующем `push`.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	// ── 1. Причины отзыва ───────────────────────────────────────────────────
	//
	// Имя типа задано в коллекции явно (`enumName`), потому что умолчание
	// Payload для поля `revokedReason` совпало бы с уже существующим типом
	// сессий.
	await db.execute(sql`
		DO $$ BEGIN
			CREATE TYPE "enum_trusted_devices_revoked_reason" AS ENUM (
				'user', 'password_changed', 'logout_all', 'reuse', 'admin'
			);
		EXCEPTION
			WHEN duplicate_object THEN NULL;
		END $$;
	`);

	// ── 2. Сама таблица ─────────────────────────────────────────────────────
	//
	// `token_hash` и `previous_token_hash` — SHA-256 секретов, а не сами
	// секреты: утечка дампа не должна давать возможности войти. Индексы на
	// них нужны не для поиска (ищем всегда по `device_id`), а для ревизии:
	// найти запись по известному хешу при разборе инцидента.
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS "trusted_devices" (
			"id" serial PRIMARY KEY NOT NULL,
			"user_id" integer NOT NULL,
			"session_id" integer,
			"device_id" varchar NOT NULL,
			"token_hash" varchar NOT NULL,
			"previous_token_hash" varchar,
			"rotated_at" timestamp(3) with time zone,
			"device_label" varchar,
			"user_agent" varchar,
			"fingerprint" varchar NOT NULL,
			"ip_prefix" varchar,
			"last_ip" varchar,
			"last_used_at" timestamp(3) with time zone NOT NULL,
			"expires_at" timestamp(3) with time zone NOT NULL,
			"revoked" boolean DEFAULT false,
			"revoked_reason" "enum_trusted_devices_revoked_reason",
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);
	`);

	await db.execute(sql`
		ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
		ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_session_id_sessions_id_fk"
			FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;
	`);

	await db.execute(sql`
		-- Единственный ключ поиска при входе: cookie приносит device_id, и по
		-- нему достаётся ровно одна строка. UNIQUE здесь не оптимизация, а
		-- ограничение целостности: два устройства с одним идентификатором
		-- сделали бы проверку секрета недетерминированной.
		CREATE UNIQUE INDEX IF NOT EXISTS "trusted_devices_device_id_idx"
			ON "trusted_devices" USING btree ("device_id");

		CREATE INDEX IF NOT EXISTS "trusted_devices_user_idx"
			ON "trusted_devices" USING btree ("user_id");
		CREATE INDEX IF NOT EXISTS "trusted_devices_session_idx"
			ON "trusted_devices" USING btree ("session_id");
		CREATE INDEX IF NOT EXISTS "trusted_devices_token_hash_idx"
			ON "trusted_devices" USING btree ("token_hash");
		CREATE INDEX IF NOT EXISTS "trusted_devices_previous_token_hash_idx"
			ON "trusted_devices" USING btree ("previous_token_hash");
		CREATE INDEX IF NOT EXISTS "trusted_devices_expires_at_idx"
			ON "trusted_devices" USING btree ("expires_at");
		CREATE INDEX IF NOT EXISTS "trusted_devices_revoked_idx"
			ON "trusted_devices" USING btree ("revoked");
		CREATE INDEX IF NOT EXISTS "trusted_devices_updated_at_idx"
			ON "trusted_devices" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "trusted_devices_created_at_idx"
			ON "trusted_devices" USING btree ("created_at");
	`);

	// ── 3. Блокировки документов в админке ──────────────────────────────────
	//
	// Payload держит по колонке на коллекцию в общей таблице связей; без неё
	// открытие новой коллекции в админке падает на отсутствующей колонке.
	await db.execute(sql`
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "trusted_devices_id" integer;

		ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trusted_devices_fk"
			FOREIGN KEY ("trusted_devices_id") REFERENCES "public"."trusted_devices"("id") ON DELETE cascade ON UPDATE no action;

		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trusted_devices_id_idx"
			ON "payload_locked_documents_rels" USING btree ("trusted_devices_id");
	`);
}

/**
 * Откат.
 *
 * Таблица удаляется целиком, и это безопасно: доверие — производное
 * состояние, а не данные пользователя. После отката все входы снова пойдут
 * через одноразовый код, cookie `trusted-device` в браузерах останется и
 * будет игнорироваться (без записи в базе проверка не проходит — см.
 * evaluateTrustedDevice), а затем истечёт сама.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "payload_locked_documents_rels"
			DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trusted_devices_fk";
		ALTER TABLE "payload_locked_documents_rels"
			DROP COLUMN IF EXISTS "trusted_devices_id";

		DROP TABLE IF EXISTS "trusted_devices" CASCADE;
		DROP TYPE IF EXISTS "enum_trusted_devices_revoked_reason";
	`);
}
