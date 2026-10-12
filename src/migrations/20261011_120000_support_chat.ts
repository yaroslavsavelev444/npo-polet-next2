import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Чат с менеджером (src/modules/support-chat): диалоги, сообщения, вложения,
 * заготовки ответов, настройки и поля менеджера у персонала.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОТКУДА ИМЕНА
 * ────────────────────────────────────────────────────────────────────────────
 * Миграция написана руками (см. шапку 20260922_120000_trusted_devices.ts),
 * но операторы не придуманы: это вывод `scripts/schema-diff.mts` — того, что
 * drizzle-kit сделал бы dev-push'ем для новых коллекций, — переписанный в
 * идемпотентном виде (IF NOT EXISTS, DO-блоки на ограничения и типы).
 * Проверка: после `pnpm payload:migrate` тот же скрипт не должен показывать
 * ни одного оператора про support_*, кроме известного дрейфа ниже.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ШИФРОВАНИЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Переписка хранится зашифрованной (src/modules/support-chat/server/crypto.ts):
 *  • support_conversations.encryption_key — ключ данных диалога, обёрнутый
 *    мастер-ключом из SUPPORT_ENCRYPTION_KEYS. Ключа в базе нет.
 *  • support_messages.body — шифртекст JSON {текст, контекст, документы};
 *    отдельной колонки context нет — контекст тоже конфиденциален.
 *  • support_conversations.csat_comment — шифртекст.
 *  • support_attachments — только метаданные: сам файл зашифрован на диске
 *    под storage_key, исходное имя — в encrypted_name, ключ — encryption_key.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ОТЛИЧИЯ ОТ ВЫВОДА PAYLOAD
 * ────────────────────────────────────────────────────────────────────────────
 *  • support_messages.conversation_id — ON DELETE CASCADE, а не set null:
 *    колонка NOT NULL, и set null превратил бы удаление диалога в ошибку
 *    ограничения (так же сделано в restock_subscriptions).
 *
 *  • support_conversations_one_open_per_user_idx — частичный уникальный
 *    индекс (user_id WHERE status = 'open'): правило «один активный диалог на
 *    покупателя», на нём держится гонка двух вкладок (conversations.db.ts).
 *
 *  • support_conversations_awaiting_idx — частичный индекс очереди.
 *
 * Payload частичные индексы выразить не умеет и при сверке схемы предложит их
 * удалить — известный дрейф, как у account_deletion_requests_active_user_idx.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ДАННЫЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Расписание по умолчанию (решение владельца, 11.10.2026): будни 09–18 с
 * общим сроком ответа, выходные 09–18 со сроком 60 минут. Заполняется, только
 * если строки глобала ещё нет, — уже настроенное не трогается.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	// ── 1. Перечисления ─────────────────────────────────────────────────────
	await db.execute(sql`
		DO $$ BEGIN
			CREATE TYPE "public"."enum_admins_support_topics" AS ENUM('order', 'product', 'documents', 'delivery', 'payment', 'other');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_conversations_status" AS ENUM('open', 'resolved');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_conversations_topic" AS ENUM('order', 'product', 'documents', 'delivery', 'payment', 'other');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_conversations_priority" AS ENUM('normal', 'high');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_messages_author_type" AS ENUM('customer', 'staff', 'system');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_messages_kind" AS ENUM('text', 'note', 'system');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_canned_responses_topics" AS ENUM('order', 'product', 'documents', 'delivery', 'payment', 'other');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_canned_responses_scope" AS ENUM('shared', 'personal');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_settings_schedule_day" AS ENUM('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			CREATE TYPE "public"."enum_support_settings_routing_mode" AS ENUM('auto', 'manual');
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
	`);

	// ── 2. Таблицы ──────────────────────────────────────────────────────────
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS "admins_support_topics" (
			"order" integer NOT NULL,
			"parent_id" integer NOT NULL,
			"value" "enum_admins_support_topics",
			"id" serial PRIMARY KEY NOT NULL
		);
		CREATE TABLE IF NOT EXISTS "support_conversations" (
			"id" serial PRIMARY KEY NOT NULL,
			"user_id" integer,
			"status" "enum_support_conversations_status" DEFAULT 'open' NOT NULL,
			"snoozed_until" timestamp(3) with time zone,
			"assignee_id" integer,
			"assigned_at" timestamp(3) with time zone,
			"topic" "enum_support_conversations_topic" DEFAULT 'other' NOT NULL,
			"priority" "enum_support_conversations_priority" DEFAULT 'normal' NOT NULL,
			"last_seq" numeric DEFAULT 0 NOT NULL,
			"customer_last_read_seq" numeric DEFAULT 0 NOT NULL,
			"staff_last_read_seq" numeric DEFAULT 0 NOT NULL,
			"last_message_at" timestamp(3) with time zone,
			"last_customer_message_at" timestamp(3) with time zone,
			"last_staff_message_at" timestamp(3) with time zone,
			"awaiting_reply_since" timestamp(3) with time zone,
			"first_response_at" timestamp(3) with time zone,
			"resolved_at" timestamp(3) with time zone,
			"reopened_count" numeric DEFAULT 0 NOT NULL,
			"csat_score" numeric,
			"csat_comment" varchar,
			"consent_accepted_at" timestamp(3) with time zone,
			"consent_document" varchar,
			"user_agent" varchar,
			"encryption_key" varchar NOT NULL,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);
		CREATE TABLE IF NOT EXISTS "support_conversations_texts" (
			"id" serial PRIMARY KEY NOT NULL,
			"order" integer NOT NULL,
			"parent_id" integer NOT NULL,
			"path" varchar NOT NULL,
			"text" varchar
		);
		CREATE TABLE IF NOT EXISTS "support_messages" (
			"id" serial PRIMARY KEY NOT NULL,
			"conversation_id" integer NOT NULL,
			"seq" numeric NOT NULL,
			"author_type" "enum_support_messages_author_type" NOT NULL,
			"author_user_id" integer,
			"author_admin_id" integer,
			"kind" "enum_support_messages_kind" DEFAULT 'text' NOT NULL,
			"body" varchar,
			"client_message_id" varchar,
			"canned_response_id" integer,
			"edited_at" timestamp(3) with time zone,
			"deleted_at" timestamp(3) with time zone,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);
		CREATE TABLE IF NOT EXISTS "support_attachments" (
			"id" serial PRIMARY KEY NOT NULL,
			"conversation_id" integer,
			"message_id" integer,
			"uploaded_by_user_id" integer,
			"uploaded_by_admin_id" integer,
			"visible_to_user_id" integer,
			"attached_at" timestamp(3) with time zone,
			"mime_type" varchar NOT NULL,
			"filesize" numeric NOT NULL,
			"width" numeric,
			"height" numeric,
			"has_thumbnail" boolean DEFAULT false,
			"storage_key" varchar NOT NULL,
			"encrypted_name" varchar NOT NULL,
			"encryption_key" varchar NOT NULL,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);
		CREATE TABLE IF NOT EXISTS "support_canned_responses_triggers" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"phrase" varchar NOT NULL
		);
		CREATE TABLE IF NOT EXISTS "support_canned_responses_topics" (
			"order" integer NOT NULL,
			"parent_id" integer NOT NULL,
			"value" "enum_support_canned_responses_topics",
			"id" serial PRIMARY KEY NOT NULL
		);
		CREATE TABLE IF NOT EXISTS "support_canned_responses" (
			"id" serial PRIMARY KEY NOT NULL,
			"title" varchar NOT NULL,
			"shortcut" varchar,
			"body" varchar NOT NULL,
			"scope" "enum_support_canned_responses_scope" DEFAULT 'shared' NOT NULL,
			"owner_id" integer,
			"is_active" boolean DEFAULT true,
			"usage_count" numeric DEFAULT 0,
			"suggested_count" numeric DEFAULT 0,
			"last_used_at" timestamp(3) with time zone,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);
		CREATE TABLE IF NOT EXISTS "support_canned_responses_rels" (
			"id" serial PRIMARY KEY NOT NULL,
			"order" integer,
			"parent_id" integer NOT NULL,
			"path" varchar NOT NULL,
			"media_id" integer
		);
		CREATE TABLE IF NOT EXISTS "support_settings_schedule" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"day" "enum_support_settings_schedule_day" NOT NULL,
			"opens_at" varchar DEFAULT '09:00' NOT NULL,
			"closes_at" varchar DEFAULT '18:00' NOT NULL,
			"sla_minutes" numeric
		);
		CREATE TABLE IF NOT EXISTS "support_settings_holidays" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"date" timestamp(3) with time zone NOT NULL,
			"note" varchar
		);
		CREATE TABLE IF NOT EXISTS "support_settings" (
			"id" serial PRIMARY KEY NOT NULL,
			"enabled" boolean DEFAULT false,
			"timezone" varchar DEFAULT 'Europe/Moscow' NOT NULL,
			"texts_greeting" varchar DEFAULT 'Здравствуйте! Напишите вопрос — менеджер ответит здесь же.',
			"texts_off_hours_reply" varchar DEFAULT 'Сейчас нерабочее время. Мы получили ваше сообщение и ответим, как только начнём работу.',
			"routing_mode" "enum_support_settings_routing_mode" DEFAULT 'auto' NOT NULL,
			"routing_first_response_sla_minutes" numeric DEFAULT 15 NOT NULL,
			"routing_reassign_after_minutes" numeric DEFAULT 10 NOT NULL,
			"lifecycle_reopen_window_days" numeric DEFAULT 7 NOT NULL,
			"lifecycle_auto_close_after_days" numeric DEFAULT 3 NOT NULL,
			"updated_at" timestamp(3) with time zone,
			"created_at" timestamp(3) with time zone
		);
		CREATE TABLE IF NOT EXISTS "support_settings_rels" (
			"id" serial PRIMARY KEY NOT NULL,
			"order" integer,
			"parent_id" integer NOT NULL,
			"path" varchar NOT NULL,
			"users_id" integer
		);
	`);

	// ── 3. Новые колонки существующих таблиц ────────────────────────────────
	//
	// admins.support_* — как менеджера видит покупатель;
	// payload_locked_documents_rels — по колонке на каждую новую коллекцию.
	await db.execute(sql`
		ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "support_display_name" varchar;
		ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "support_avatar_id" integer;
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "support_conversations_id" integer;
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "support_messages_id" integer;
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "support_attachments_id" integer;
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "support_canned_responses_id" integer;
	`);

	// ── 4. Внешние ключи ────────────────────────────────────────────────────
	await db.execute(sql`
		DO $$ BEGIN
			ALTER TABLE "admins_support_topics" ADD CONSTRAINT "admins_support_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_conversations" ADD CONSTRAINT "support_conversations_assignee_id_admins_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_conversations_texts" ADD CONSTRAINT "support_conversations_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_admin_id_admins_id_fk" FOREIGN KEY ("author_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_canned_response_id_support_canned_responses_id_fk" FOREIGN KEY ("canned_response_id") REFERENCES "public"."support_canned_responses"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_conversation_id_support_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."support_conversations"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_message_id_support_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."support_messages"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_uploaded_by_admin_id_admins_id_fk" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_attachments" ADD CONSTRAINT "support_attachments_visible_to_user_id_users_id_fk" FOREIGN KEY ("visible_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_canned_responses_triggers" ADD CONSTRAINT "support_canned_responses_triggers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_canned_responses"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_canned_responses_topics" ADD CONSTRAINT "support_canned_responses_topics_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."support_canned_responses"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_canned_responses" ADD CONSTRAINT "support_canned_responses_owner_id_admins_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_canned_responses_rels" ADD CONSTRAINT "support_canned_responses_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."support_canned_responses"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_canned_responses_rels" ADD CONSTRAINT "support_canned_responses_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_settings_schedule" ADD CONSTRAINT "support_settings_schedule_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_settings"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_settings_holidays" ADD CONSTRAINT "support_settings_holidays_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_settings"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_settings_rels" ADD CONSTRAINT "support_settings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."support_settings"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "support_settings_rels" ADD CONSTRAINT "support_settings_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "admins" ADD CONSTRAINT "admins_support_avatar_id_media_id_fk" FOREIGN KEY ("support_avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_conversations_fk" FOREIGN KEY ("support_conversations_id") REFERENCES "public"."support_conversations"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_messages_fk" FOREIGN KEY ("support_messages_id") REFERENCES "public"."support_messages"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_attachments_fk" FOREIGN KEY ("support_attachments_id") REFERENCES "public"."support_attachments"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
		DO $$ BEGIN
			ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_support_canned_responses_fk" FOREIGN KEY ("support_canned_responses_id") REFERENCES "public"."support_canned_responses"("id") ON DELETE cascade ON UPDATE no action;
		EXCEPTION WHEN duplicate_object THEN NULL;
		END $$;
	`);

	// ── 5. Индексы ──────────────────────────────────────────────────────────
	await db.execute(sql`
		CREATE INDEX IF NOT EXISTS "admins_support_topics_order_idx" ON "admins_support_topics" USING btree ("order");
		CREATE INDEX IF NOT EXISTS "admins_support_topics_parent_idx" ON "admins_support_topics" USING btree ("parent_id");
		CREATE INDEX IF NOT EXISTS "support_conversations_user_idx" ON "support_conversations" USING btree ("user_id");
		CREATE INDEX IF NOT EXISTS "support_conversations_status_idx" ON "support_conversations" USING btree ("status");
		CREATE INDEX IF NOT EXISTS "support_conversations_assignee_idx" ON "support_conversations" USING btree ("assignee_id");
		CREATE INDEX IF NOT EXISTS "support_conversations_last_message_at_idx" ON "support_conversations" USING btree ("last_message_at");
		CREATE INDEX IF NOT EXISTS "support_conversations_awaiting_reply_since_idx" ON "support_conversations" USING btree ("awaiting_reply_since");
		CREATE INDEX IF NOT EXISTS "support_conversations_updated_at_idx" ON "support_conversations" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "support_conversations_created_at_idx" ON "support_conversations" USING btree ("created_at");
		CREATE INDEX IF NOT EXISTS "status_assignee_lastMessageAt_idx" ON "support_conversations" USING btree ("status","assignee_id","last_message_at");
		CREATE INDEX IF NOT EXISTS "user_lastMessageAt_idx" ON "support_conversations" USING btree ("user_id","last_message_at");
		CREATE INDEX IF NOT EXISTS "support_conversations_texts_order_parent" ON "support_conversations_texts" USING btree ("order","parent_id");
		CREATE INDEX IF NOT EXISTS "support_messages_conversation_idx" ON "support_messages" USING btree ("conversation_id");
		CREATE INDEX IF NOT EXISTS "support_messages_author_user_idx" ON "support_messages" USING btree ("author_user_id");
		CREATE INDEX IF NOT EXISTS "support_messages_author_admin_idx" ON "support_messages" USING btree ("author_admin_id");
		CREATE INDEX IF NOT EXISTS "support_messages_canned_response_idx" ON "support_messages" USING btree ("canned_response_id");
		CREATE INDEX IF NOT EXISTS "support_messages_updated_at_idx" ON "support_messages" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "support_messages_created_at_idx" ON "support_messages" USING btree ("created_at");
		CREATE UNIQUE INDEX IF NOT EXISTS "conversation_seq_idx" ON "support_messages" USING btree ("conversation_id","seq");
		CREATE UNIQUE INDEX IF NOT EXISTS "conversation_clientMessageId_idx" ON "support_messages" USING btree ("conversation_id","client_message_id");
		CREATE INDEX IF NOT EXISTS "support_attachments_conversation_idx" ON "support_attachments" USING btree ("conversation_id");
		CREATE INDEX IF NOT EXISTS "support_attachments_message_idx" ON "support_attachments" USING btree ("message_id");
		CREATE INDEX IF NOT EXISTS "support_attachments_uploaded_by_user_idx" ON "support_attachments" USING btree ("uploaded_by_user_id");
		CREATE INDEX IF NOT EXISTS "support_attachments_uploaded_by_admin_idx" ON "support_attachments" USING btree ("uploaded_by_admin_id");
		CREATE INDEX IF NOT EXISTS "support_attachments_visible_to_user_idx" ON "support_attachments" USING btree ("visible_to_user_id");
		CREATE UNIQUE INDEX IF NOT EXISTS "support_attachments_storage_key_idx" ON "support_attachments" USING btree ("storage_key");
		CREATE INDEX IF NOT EXISTS "support_attachments_updated_at_idx" ON "support_attachments" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "support_attachments_created_at_idx" ON "support_attachments" USING btree ("created_at");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_triggers_order_idx" ON "support_canned_responses_triggers" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_triggers_parent_id_idx" ON "support_canned_responses_triggers" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_topics_order_idx" ON "support_canned_responses_topics" USING btree ("order");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_topics_parent_idx" ON "support_canned_responses_topics" USING btree ("parent_id");
		CREATE UNIQUE INDEX IF NOT EXISTS "support_canned_responses_shortcut_idx" ON "support_canned_responses" USING btree ("shortcut");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_owner_idx" ON "support_canned_responses" USING btree ("owner_id");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_updated_at_idx" ON "support_canned_responses" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_created_at_idx" ON "support_canned_responses" USING btree ("created_at");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_rels_order_idx" ON "support_canned_responses_rels" USING btree ("order");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_rels_parent_idx" ON "support_canned_responses_rels" USING btree ("parent_id");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_rels_path_idx" ON "support_canned_responses_rels" USING btree ("path");
		CREATE INDEX IF NOT EXISTS "support_canned_responses_rels_media_id_idx" ON "support_canned_responses_rels" USING btree ("media_id");
		CREATE INDEX IF NOT EXISTS "support_settings_schedule_order_idx" ON "support_settings_schedule" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "support_settings_schedule_parent_id_idx" ON "support_settings_schedule" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "support_settings_holidays_order_idx" ON "support_settings_holidays" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "support_settings_holidays_parent_id_idx" ON "support_settings_holidays" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "support_settings_rels_order_idx" ON "support_settings_rels" USING btree ("order");
		CREATE INDEX IF NOT EXISTS "support_settings_rels_parent_idx" ON "support_settings_rels" USING btree ("parent_id");
		CREATE INDEX IF NOT EXISTS "support_settings_rels_path_idx" ON "support_settings_rels" USING btree ("path");
		CREATE INDEX IF NOT EXISTS "support_settings_rels_users_id_idx" ON "support_settings_rels" USING btree ("users_id");
		CREATE INDEX IF NOT EXISTS "admins_support_support_avatar_idx" ON "admins" USING btree ("support_avatar_id");
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_support_conversations_id_idx" ON "payload_locked_documents_rels" USING btree ("support_conversations_id");
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_support_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("support_messages_id");
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_support_attachments_id_idx" ON "payload_locked_documents_rels" USING btree ("support_attachments_id");
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_support_canned_responses_i_idx" ON "payload_locked_documents_rels" USING btree ("support_canned_responses_id");

		CREATE UNIQUE INDEX IF NOT EXISTS "support_conversations_one_open_per_user_idx"
			ON "support_conversations" USING btree ("user_id")
			WHERE "status" = 'open' AND "user_id" IS NOT NULL;
		CREATE INDEX IF NOT EXISTS "support_conversations_awaiting_idx"
			ON "support_conversations" USING btree ("awaiting_reply_since")
			WHERE "status" = 'open' AND "awaiting_reply_since" IS NOT NULL;
	`);

	// ── 6. Настройки по умолчанию ───────────────────────────────────────────
	await db.execute(sql`
		WITH settings AS (
			INSERT INTO "support_settings" ("created_at", "updated_at")
			SELECT now(), now()
			WHERE NOT EXISTS (SELECT 1 FROM "support_settings")
			RETURNING "id"
		)
		INSERT INTO "support_settings_schedule"
			("_order", "_parent_id", "id", "day", "opens_at", "closes_at", "sla_minutes")
		SELECT d.ord, settings.id, md5(random()::text || d.ord::text), d.day::"enum_support_settings_schedule_day",
			'09:00', '18:00', d.sla
		FROM settings,
			(VALUES
				(1, 'mon', NULL::numeric), (2, 'tue', NULL), (3, 'wed', NULL),
				(4, 'thu', NULL), (5, 'fri', NULL), (6, 'sat', 60), (7, 'sun', 60)
			) AS d(ord, day, sla);
	`);
}

/**
 * Откат. Переписка удаляется вместе с таблицами — на проде это равно
 * удалению всех диалогов. Зашифрованные файлы вложений остаются на диске
 * (media/support-attachments) и без ключей в базе нечитаемы.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_support_conversations_fk";
		ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_support_messages_fk";
		ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_support_attachments_fk";
		ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_support_canned_responses_fk";
		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "support_conversations_id";
		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "support_messages_id";
		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "support_attachments_id";
		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "support_canned_responses_id";

		ALTER TABLE "admins" DROP CONSTRAINT IF EXISTS "admins_support_avatar_id_media_id_fk";
		ALTER TABLE "admins" DROP COLUMN IF EXISTS "support_display_name";
		ALTER TABLE "admins" DROP COLUMN IF EXISTS "support_avatar_id";

		DROP TABLE IF EXISTS "admins_support_topics" CASCADE;
		DROP TABLE IF EXISTS "support_settings_rels" CASCADE;
		DROP TABLE IF EXISTS "support_settings_holidays" CASCADE;
		DROP TABLE IF EXISTS "support_settings_schedule" CASCADE;
		DROP TABLE IF EXISTS "support_settings" CASCADE;
		DROP TABLE IF EXISTS "support_attachments" CASCADE;
		DROP TABLE IF EXISTS "support_messages" CASCADE;
		DROP TABLE IF EXISTS "support_conversations_texts" CASCADE;
		DROP TABLE IF EXISTS "support_conversations" CASCADE;
		DROP TABLE IF EXISTS "support_canned_responses_rels" CASCADE;
		DROP TABLE IF EXISTS "support_canned_responses_topics" CASCADE;
		DROP TABLE IF EXISTS "support_canned_responses_triggers" CASCADE;
		DROP TABLE IF EXISTS "support_canned_responses" CASCADE;

		DROP TYPE IF EXISTS "public"."enum_admins_support_topics";
		DROP TYPE IF EXISTS "public"."enum_support_conversations_status";
		DROP TYPE IF EXISTS "public"."enum_support_conversations_topic";
		DROP TYPE IF EXISTS "public"."enum_support_conversations_priority";
		DROP TYPE IF EXISTS "public"."enum_support_messages_author_type";
		DROP TYPE IF EXISTS "public"."enum_support_messages_kind";
		DROP TYPE IF EXISTS "public"."enum_support_canned_responses_topics";
		DROP TYPE IF EXISTS "public"."enum_support_canned_responses_scope";
		DROP TYPE IF EXISTS "public"."enum_support_settings_schedule_day";
		DROP TYPE IF EXISTS "public"."enum_support_settings_routing_mode";
	`);
}
