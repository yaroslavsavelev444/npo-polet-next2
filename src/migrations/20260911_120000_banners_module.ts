import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Модуль баннеров: переписанная коллекция `banners` плюс две служебные —
 * `banner_states` (состояние показа у конкретного покупателя) и `banner_events`
 * (журнал взаимодействий).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ПРОИСХОДИТ С ПРЕЖНИМИ ДАННЫМИ
 * ────────────────────────────────────────────────────────────────────────────
 * Прежняя коллекция была портом баннера мобильного приложения и не была
 * подключена ни к одному экрану витрины (её единственный сервис,
 * `banners.service.ts`, не импортировался ниоткуда). Поэтому строки в ней если
 * и есть, то никогда никому не показывались.
 *
 * Тем не менее таблица НЕ пересоздаётся с нуля: текст, написанный редактором,
 * — это работа, и терять её миграция не вправе. Переносится то, что имеет
 * соответствие:
 *
 *   title       → name (название в админке) и content_title (заголовок модалки)
 *   description → content_body
 *   priority, start_at, end_at, is_system — остаются как есть
 *
 * Всё остальное отбрасывается вместе с моделью, которой оно принадлежало:
 * `subtitle` (в модалке нет подзаголовка — есть заголовок и текст), `action` /
 * `action_payload` (режим «открыть модалку» бессмыслен у самой модалки, а
 * «ссылка» и «редирект» различаются теперь типом адреса), `repeatable`
 * (заменён политикой показа из четырёх правил), `targeting.roles` (роль на
 * коллекции `users` не является достоверным признаком — см. access/ownership.ts)
 * и черновики Payload (`_status`, таблицы `_banners_v*`) — их роль играет поле
 * `status`.
 *
 * Статус ВСЕХ перенесённых строк становится `draft`. Это сознательно: баннер,
 * написанный под другую модель, не проходил проверку по новым правилам, и
 * автоматически выпускать его на живых покупателей нельзя. Редактор откроет,
 * дополнит и отправит на публикацию сам — с обычным пятнадцатиминутным окном.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ МИГРАЦИЯ НАПИСАНА РУКАМИ
 * ────────────────────────────────────────────────────────────────────────────
 * `payload migrate:create` сравнивает схему со снимком в `src/migrations/*.json`,
 * а последний снимок относится к `20260904_153241_promo_codes`: все миграции
 * после него написаны вручную и снимков не обновляли. Автогенерация выдала бы
 * не диff этой задачи, а разницу с полугодовой давностью — вместе с
 * интерактивными вопросами «это создание или переименование?» по чужим
 * таблицам.
 *
 * DDL ниже не выдуман: он снят с базы, в которую Payload синхронизировал эту же
 * конфигурацию через `push`, — поэтому имена таблиц, колонок, индексов и
 * ограничений в точности те, которых Payload ожидает. Это важнее, чем кажется:
 * индекс с «логичным», но другим именем Payload не увидит и попытается создать
 * свой при следующем `push`, а колонку с другим именем не найдёт вовсе.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	// ── 1. Снести всё, что принадлежало прежней модели ──────────────────────
	//
	// Версии, роли таргетинга и таблица связей. `banners_rels` уходит целиком:
	// в новой схеме у баннера нет ни одной связи «многие ко многим» —
	// изображение, автор и редактор хранятся прямыми колонками.
	await db.execute(sql`
		DROP TABLE IF EXISTS "_banners_v_version_targeting_roles" CASCADE;
		DROP TABLE IF EXISTS "_banners_v_rels" CASCADE;
		DROP TABLE IF EXISTS "_banners_v" CASCADE;
		DROP TABLE IF EXISTS "banners_targeting_roles" CASCADE;
		DROP TABLE IF EXISTS "banners_rels" CASCADE;
	`);

	// ── 2. Перенести то, что переносится, и убрать остальное ────────────────
	await db.execute(sql`
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "name" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "content_title" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "content_body" varchar;

		UPDATE "banners"
		SET "name" = COALESCE(NULLIF(TRIM("title"), ''), 'Баннер без названия'),
		    "content_title" = COALESCE(NULLIF(TRIM("title"), ''), 'Заголовок не задан'),
		    "content_body" = "description";

		ALTER TABLE "banners" ALTER COLUMN "name" SET NOT NULL;
		ALTER TABLE "banners" ALTER COLUMN "content_title" SET NOT NULL;

		ALTER TABLE "banners" DROP COLUMN IF EXISTS "title";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "subtitle";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "description";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "action";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "action_payload";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "repeatable";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "_status";
	`);

	await db.execute(sql`
		DROP INDEX IF EXISTS "banners__status_idx";
	`);

	// ── 3. Пересобрать enum статуса ─────────────────────────────────────────
	//
	// Из набора draft|active|scheduled|archived в draft|scheduled|paused|archived.
	// Postgres не умеет удалять значения из enum, поэтому тип пересоздаётся
	// целиком; колонка на время перехода становится текстовой, а все строки —
	// черновиками (см. шапку).
	await db.execute(sql`
		ALTER TABLE "banners" ALTER COLUMN "status" DROP DEFAULT;
		ALTER TABLE "banners" ALTER COLUMN "status" TYPE text USING 'draft';

		DROP TYPE IF EXISTS "enum_banners_status";
		CREATE TYPE "enum_banners_status" AS ENUM ('draft', 'scheduled', 'paused', 'archived');

		ALTER TABLE "banners"
			ALTER COLUMN "status" TYPE "enum_banners_status" USING "status"::"enum_banners_status";
		ALTER TABLE "banners" ALTER COLUMN "status" SET DEFAULT 'draft';
		ALTER TABLE "banners" ALTER COLUMN "status" SET NOT NULL;

		DROP TYPE IF EXISTS "enum_banners_action";
		DROP TYPE IF EXISTS "enum_banners_targeting_roles";
		DROP TYPE IF EXISTS "enum__banners_v_version_status";
		DROP TYPE IF EXISTS "enum__banners_v_version_action";
		DROP TYPE IF EXISTS "enum__banners_v_version_targeting_roles";
		DROP TYPE IF EXISTS "enum__banners_v_published_locale";
	`);

	// ── 4. Новые типы ───────────────────────────────────────────────────────
	await db.execute(sql`
		CREATE TYPE "enum_banners_content_image_mode" AS ENUM ('background', 'post');
		CREATE TYPE "enum_banners_cta_kind" AS ENUM ('internal', 'external');
		CREATE TYPE "enum_banners_link_kind" AS ENUM ('internal', 'external');
		CREATE TYPE "enum_banners_condition_match" AS ENUM ('all', 'any');
		CREATE TYPE "enum_banners_importance" AS ENUM ('normal', 'important');
		CREATE TYPE "enum_banners_policy_kind" AS ENUM ('once', 'limited', 'interval', 'until_outcome');
		CREATE TYPE "enum_banners_policy_outcome" AS ENUM ('cta', 'dwell', 'cta_or_dwell');
		CREATE TYPE "enum_banners_blocks_order_count_scope" AS ENUM ('any', 'delivered', 'active');
		CREATE TYPE "enum_banners_blocks_cart_state" AS ENUM ('filled', 'empty');
		CREATE TYPE "enum_banners_blocks_action_action" AS ENUM (
			'order_placed', 'order_delivered', 'review_left', 'promo_code_used', 'wishlist_item_added'
		);
		CREATE TYPE "enum_banner_states_status" AS ENUM ('active', 'satisfied', 'exhausted');
		CREATE TYPE "enum_banner_states_last_close_method" AS ENUM (
			'close-button', 'overlay', 'escape', 'cta', 'link', 'navigation'
		);
		CREATE TYPE "enum_banner_events_kind" AS ENUM (
			'delivered', 'impression', 'view', 'cta', 'link', 'dismiss', 'outcome'
		);
		CREATE TYPE "enum_banner_events_close_method" AS ENUM (
			'close-button', 'overlay', 'escape', 'cta', 'link', 'navigation'
		);
	`);

	// ── 5. Новые колонки баннера ────────────────────────────────────────────
	await db.execute(sql`
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "publish_at" timestamp(3) with time zone;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "content_image_id" integer;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "content_image_mode" "enum_banners_content_image_mode" DEFAULT 'post';
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "cta_enabled" boolean DEFAULT true;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "cta_label" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "cta_kind" "enum_banners_cta_kind" DEFAULT 'internal';
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "cta_href" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "link_enabled" boolean DEFAULT false;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "link_label" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "link_kind" "enum_banners_link_kind" DEFAULT 'internal';
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "link_href" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "condition_match" "enum_banners_condition_match" DEFAULT 'all' NOT NULL;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "importance" "enum_banners_importance" DEFAULT 'normal' NOT NULL;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "delay_seconds" numeric DEFAULT 0;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "policy_kind" "enum_banners_policy_kind" DEFAULT 'once' NOT NULL;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "policy_repeat_after_hours" numeric;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "policy_max_impressions" numeric;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "policy_outcome" "enum_banners_policy_outcome" DEFAULT 'cta_or_dwell' NOT NULL;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "policy_dwell_seconds" numeric DEFAULT 5;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "seed_key" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "created_by_id" integer;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "updated_by_id" integer;

		ALTER TABLE "banners" ADD CONSTRAINT "banners_content_image_id_media_id_fk"
			FOREIGN KEY ("content_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
		ALTER TABLE "banners" ADD CONSTRAINT "banners_created_by_id_admins_id_fk"
			FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
		ALTER TABLE "banners" ADD CONSTRAINT "banners_updated_by_id_admins_id_fk"
			FOREIGN KEY ("updated_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;

		CREATE INDEX IF NOT EXISTS "banners_content_content_image_idx" ON "banners" USING btree ("content_image_id");
		CREATE INDEX IF NOT EXISTS "banners_created_by_idx" ON "banners" USING btree ("created_by_id");
		CREATE INDEX IF NOT EXISTS "banners_updated_by_idx" ON "banners" USING btree ("updated_by_id");
		CREATE INDEX IF NOT EXISTS "banners_priority_idx" ON "banners" USING btree ("priority");
		CREATE INDEX IF NOT EXISTS "banners_publish_at_idx" ON "banners" USING btree ("publish_at");
		CREATE UNIQUE INDEX IF NOT EXISTS "banners_seed_key_idx" ON "banners" USING btree ("seed_key");
	`);

	// ── 6. Блоки условий ────────────────────────────────────────────────────
	//
	// По таблице на тип условия — так Payload раскладывает `type: "blocks"`.
	// Добавление нового типа условия в будущем означает новую таблицу и НИ
	// ОДНОЙ правки в существующих: ровно то свойство, ради которого условия
	// сделаны блоками, а не одним JSON-полем.
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS "banners_blocks_account_age" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"_path" text NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"min_days" numeric,
			"max_days" numeric,
			"block_name" varchar
		);

		CREATE TABLE IF NOT EXISTS "banners_blocks_email_verified" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"_path" text NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"verified" boolean DEFAULT false,
			"block_name" varchar
		);

		CREATE TABLE IF NOT EXISTS "banners_blocks_order_count" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"_path" text NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"scope" "enum_banners_blocks_order_count_scope" DEFAULT 'any' NOT NULL,
			"min_count" numeric,
			"max_count" numeric,
			"min_days_since_last" numeric,
			"max_days_since_last" numeric,
			"block_name" varchar
		);

		CREATE TABLE IF NOT EXISTS "banners_blocks_cart" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"_path" text NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"state" "enum_banners_blocks_cart_state" DEFAULT 'filled' NOT NULL,
			"min_items" numeric,
			"max_items" numeric,
			"min_total" numeric,
			"max_total" numeric,
			"min_idle_hours" numeric,
			"max_idle_hours" numeric,
			"block_name" varchar
		);

		CREATE TABLE IF NOT EXISTS "banners_blocks_wishlist" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"_path" text NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"min_items" numeric,
			"max_items" numeric,
			"block_name" varchar
		);

		CREATE TABLE IF NOT EXISTS "banners_blocks_pending_reviews" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"_path" text NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"min_count" numeric,
			"max_count" numeric,
			"block_name" varchar
		);

		CREATE TABLE IF NOT EXISTS "banners_blocks_action" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"_path" text NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"action" "enum_banners_blocks_action_action" NOT NULL,
			"performed" boolean DEFAULT true,
			"within_days" numeric,
			"block_name" varchar
		);

		CREATE TABLE IF NOT EXISTS "banners_blocks_page" (
			"_order" integer NOT NULL,
			"_parent_id" integer NOT NULL,
			"_path" text NOT NULL,
			"id" varchar PRIMARY KEY NOT NULL,
			"block_name" varchar
		);
	`);

	// Список путей условия «страница» — это поле `hasMany: true` у текста, и
	// Payload складывает ВСЕ такие поля коллекции в одну таблицу `<коллекция>_texts`,
	// различая их колонкой `path`. Отсюда и её единственный индекс по
	// («order», parent_id): читается она всегда целиком для одного баннера.
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS "banners_texts" (
			"id" serial PRIMARY KEY NOT NULL,
			"order" integer NOT NULL,
			"parent_id" integer NOT NULL,
			"path" varchar NOT NULL,
			"text" varchar
		);
	`);

	await db.execute(sql`
		ALTER TABLE "banners_blocks_account_age" ADD CONSTRAINT "banners_blocks_account_age_parent_id_fk"
			FOREIGN KEY ("_parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_blocks_email_verified" ADD CONSTRAINT "banners_blocks_email_verified_parent_id_fk"
			FOREIGN KEY ("_parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_blocks_order_count" ADD CONSTRAINT "banners_blocks_order_count_parent_id_fk"
			FOREIGN KEY ("_parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_blocks_cart" ADD CONSTRAINT "banners_blocks_cart_parent_id_fk"
			FOREIGN KEY ("_parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_blocks_wishlist" ADD CONSTRAINT "banners_blocks_wishlist_parent_id_fk"
			FOREIGN KEY ("_parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_blocks_pending_reviews" ADD CONSTRAINT "banners_blocks_pending_reviews_parent_id_fk"
			FOREIGN KEY ("_parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_blocks_action" ADD CONSTRAINT "banners_blocks_action_parent_id_fk"
			FOREIGN KEY ("_parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_blocks_page" ADD CONSTRAINT "banners_blocks_page_parent_id_fk"
			FOREIGN KEY ("_parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_texts" ADD CONSTRAINT "banners_texts_parent_fk"
			FOREIGN KEY ("parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;

		CREATE INDEX IF NOT EXISTS "banners_blocks_account_age_order_idx" ON "banners_blocks_account_age" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "banners_blocks_account_age_parent_id_idx" ON "banners_blocks_account_age" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "banners_blocks_account_age_path_idx" ON "banners_blocks_account_age" USING btree ("_path");
		CREATE INDEX IF NOT EXISTS "banners_blocks_email_verified_order_idx" ON "banners_blocks_email_verified" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "banners_blocks_email_verified_parent_id_idx" ON "banners_blocks_email_verified" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "banners_blocks_email_verified_path_idx" ON "banners_blocks_email_verified" USING btree ("_path");
		CREATE INDEX IF NOT EXISTS "banners_blocks_order_count_order_idx" ON "banners_blocks_order_count" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "banners_blocks_order_count_parent_id_idx" ON "banners_blocks_order_count" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "banners_blocks_order_count_path_idx" ON "banners_blocks_order_count" USING btree ("_path");
		CREATE INDEX IF NOT EXISTS "banners_blocks_cart_order_idx" ON "banners_blocks_cart" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "banners_blocks_cart_parent_id_idx" ON "banners_blocks_cart" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "banners_blocks_cart_path_idx" ON "banners_blocks_cart" USING btree ("_path");
		CREATE INDEX IF NOT EXISTS "banners_blocks_wishlist_order_idx" ON "banners_blocks_wishlist" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "banners_blocks_wishlist_parent_id_idx" ON "banners_blocks_wishlist" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "banners_blocks_wishlist_path_idx" ON "banners_blocks_wishlist" USING btree ("_path");
		CREATE INDEX IF NOT EXISTS "banners_blocks_pending_reviews_order_idx" ON "banners_blocks_pending_reviews" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "banners_blocks_pending_reviews_parent_id_idx" ON "banners_blocks_pending_reviews" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "banners_blocks_pending_reviews_path_idx" ON "banners_blocks_pending_reviews" USING btree ("_path");
		CREATE INDEX IF NOT EXISTS "banners_blocks_action_order_idx" ON "banners_blocks_action" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "banners_blocks_action_parent_id_idx" ON "banners_blocks_action" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "banners_blocks_action_path_idx" ON "banners_blocks_action" USING btree ("_path");
		CREATE INDEX IF NOT EXISTS "banners_blocks_page_order_idx" ON "banners_blocks_page" USING btree ("_order");
		CREATE INDEX IF NOT EXISTS "banners_blocks_page_parent_id_idx" ON "banners_blocks_page" USING btree ("_parent_id");
		CREATE INDEX IF NOT EXISTS "banners_blocks_page_path_idx" ON "banners_blocks_page" USING btree ("_path");
		CREATE INDEX IF NOT EXISTS "banners_texts_order_parent" ON "banners_texts" USING btree ("order", "parent_id");
	`);

	// ── 7. Состояние показа ─────────────────────────────────────────────────
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS "banner_states" (
			"id" serial PRIMARY KEY NOT NULL,
			"banner_id" integer NOT NULL,
			"user_id" integer NOT NULL,
			"status" "enum_banner_states_status" DEFAULT 'active' NOT NULL,
			"impressions" numeric DEFAULT 0 NOT NULL,
			"deliveries" numeric DEFAULT 0 NOT NULL,
			"cta_clicks" numeric DEFAULT 0 NOT NULL,
			"total_dwell_ms" numeric DEFAULT 0 NOT NULL,
			"first_shown_at" timestamp(3) with time zone,
			"last_shown_at" timestamp(3) with time zone,
			"next_eligible_at" timestamp(3) with time zone,
			"outcome_reached_at" timestamp(3) with time zone,
			"last_impression_id" varchar,
			"in_flight_since" timestamp(3) with time zone,
			"last_close_method" "enum_banner_states_last_close_method",
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);

		ALTER TABLE "banner_states" ADD CONSTRAINT "banner_states_banner_id_banners_id_fk"
			FOREIGN KEY ("banner_id") REFERENCES "public"."banners"("id") ON DELETE set null ON UPDATE no action;
		ALTER TABLE "banner_states" ADD CONSTRAINT "banner_states_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

		CREATE INDEX IF NOT EXISTS "banner_states_banner_idx" ON "banner_states" USING btree ("banner_id");
		CREATE INDEX IF NOT EXISTS "banner_states_user_idx" ON "banner_states" USING btree ("user_id");
		CREATE INDEX IF NOT EXISTS "banner_states_status_idx" ON "banner_states" USING btree ("status");
		CREATE INDEX IF NOT EXISTS "banner_states_next_eligible_at_idx" ON "banner_states" USING btree ("next_eligible_at");
		CREATE INDEX IF NOT EXISTS "banner_states_last_impression_id_idx" ON "banner_states" USING btree ("last_impression_id");
		CREATE INDEX IF NOT EXISTS "banner_states_in_flight_since_idx" ON "banner_states" USING btree ("in_flight_since");
		CREATE INDEX IF NOT EXISTS "banner_states_updated_at_idx" ON "banner_states" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "banner_states_created_at_idx" ON "banner_states" USING btree ("created_at");

		-- Одна строка на пару «пользователь + баннер». Без этого ограничения два
		-- одновременных запроса за следующим баннером (две вкладки) создали бы
		-- два состояния, и лимит показов молча удвоился бы.
		CREATE UNIQUE INDEX IF NOT EXISTS "user_banner_idx" ON "banner_states" USING btree ("user_id", "banner_id");
	`);

	// ── 8. Журнал событий ───────────────────────────────────────────────────
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS "banner_events" (
			"id" serial PRIMARY KEY NOT NULL,
			"banner_id" integer NOT NULL,
			"user_id" integer NOT NULL,
			"impression_id" varchar NOT NULL,
			"kind" "enum_banner_events_kind" NOT NULL,
			"at" timestamp(3) with time zone NOT NULL,
			"sequence" numeric DEFAULT 1 NOT NULL,
			"dwell_ms" numeric,
			"close_method" "enum_banner_events_close_method",
			"path" varchar,
			"href" varchar,
			"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
			"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
		);

		ALTER TABLE "banner_events" ADD CONSTRAINT "banner_events_banner_id_banners_id_fk"
			FOREIGN KEY ("banner_id") REFERENCES "public"."banners"("id") ON DELETE set null ON UPDATE no action;
		ALTER TABLE "banner_events" ADD CONSTRAINT "banner_events_user_id_users_id_fk"
			FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

		CREATE INDEX IF NOT EXISTS "banner_events_banner_idx" ON "banner_events" USING btree ("banner_id");
		CREATE INDEX IF NOT EXISTS "banner_events_user_idx" ON "banner_events" USING btree ("user_id");
		CREATE INDEX IF NOT EXISTS "banner_events_impression_id_idx" ON "banner_events" USING btree ("impression_id");
		CREATE INDEX IF NOT EXISTS "banner_events_kind_idx" ON "banner_events" USING btree ("kind");
		CREATE INDEX IF NOT EXISTS "banner_events_at_idx" ON "banner_events" USING btree ("at");
		CREATE INDEX IF NOT EXISTS "banner_events_updated_at_idx" ON "banner_events" USING btree ("updated_at");
		CREATE INDEX IF NOT EXISTS "banner_events_created_at_idx" ON "banner_events" USING btree ("created_at");

		-- Защита от повторной обработки — в БАЗЕ, а не в коде. Повторно
		-- присланное закрытие (ретрай запроса, вторая вкладка) падает здесь и
		-- обрабатывается как «уже записано», вместо того чтобы удвоить
		-- длительность просмотра в отчёте.
		CREATE UNIQUE INDEX IF NOT EXISTS "impressionId_kind_idx" ON "banner_events" USING btree ("impression_id", "kind");
		-- Воронка по баннеру и темп показов у одного человека — два запроса,
		-- которые идут на каждую выдачу.
		CREATE INDEX IF NOT EXISTS "banner_kind_idx" ON "banner_events" USING btree ("banner_id", "kind");
		CREATE INDEX IF NOT EXISTS "user_kind_at_idx" ON "banner_events" USING btree ("user_id", "kind", "at");
	`);

	// ── 9. Блокировки документов в админке ──────────────────────────────────
	//
	// Payload держит по колонке на коллекцию в общей таблице связей; без них
	// открытие новой коллекции в админке падает на отсутствующей колонке.
	await db.execute(sql`
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "banner_states_id" integer;
		ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "banner_events_id" integer;

		ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_banner_states_fk"
			FOREIGN KEY ("banner_states_id") REFERENCES "public"."banner_states"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_banner_events_fk"
			FOREIGN KEY ("banner_events_id") REFERENCES "public"."banner_events"("id") ON DELETE cascade ON UPDATE no action;

		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_banner_states_id_idx"
			ON "payload_locked_documents_rels" USING btree ("banner_states_id");
		CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_banner_events_id_idx"
			ON "payload_locked_documents_rels" USING btree ("banner_events_id");
	`);
}

/**
 * Откат.
 *
 * Возвращает схему прежней коллекции, но НЕ возвращает её данные: содержимое
 * полей, которых в новой модели нет (`subtitle`, `action`, роли таргетинга),
 * удалено в `up` и восстановлению не подлежит. Это обычная цена смены модели, и
 * прятать её за наполовину работающим откатом было бы хуже, чем назвать прямо.
 *
 * Состояния показов и журнал событий при откате удаляются целиком: в прежней
 * модели для них нет ни таблиц, ни смысла.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
		ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_banner_states_fk";
		ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_banner_events_fk";
		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "banner_states_id";
		ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "banner_events_id";

		DROP TABLE IF EXISTS "banner_events" CASCADE;
		DROP TABLE IF EXISTS "banner_states" CASCADE;
		DROP TABLE IF EXISTS "banners_texts" CASCADE;
		DROP TABLE IF EXISTS "banners_blocks_account_age" CASCADE;
		DROP TABLE IF EXISTS "banners_blocks_email_verified" CASCADE;
		DROP TABLE IF EXISTS "banners_blocks_order_count" CASCADE;
		DROP TABLE IF EXISTS "banners_blocks_cart" CASCADE;
		DROP TABLE IF EXISTS "banners_blocks_wishlist" CASCADE;
		DROP TABLE IF EXISTS "banners_blocks_pending_reviews" CASCADE;
		DROP TABLE IF EXISTS "banners_blocks_action" CASCADE;
		DROP TABLE IF EXISTS "banners_blocks_page" CASCADE;
	`);

	await db.execute(sql`
		ALTER TABLE "banners" DROP CONSTRAINT IF EXISTS "banners_content_image_id_media_id_fk";
		ALTER TABLE "banners" DROP CONSTRAINT IF EXISTS "banners_created_by_id_admins_id_fk";
		ALTER TABLE "banners" DROP CONSTRAINT IF EXISTS "banners_updated_by_id_admins_id_fk";

		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "title" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "subtitle" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "description" varchar;
		UPDATE "banners" SET "title" = "content_title", "description" = "content_body";

		ALTER TABLE "banners" DROP COLUMN IF EXISTS "name";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "content_title";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "content_body";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "content_image_id";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "content_image_mode";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "publish_at";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "cta_enabled";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "cta_label";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "cta_kind";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "cta_href";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "link_enabled";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "link_label";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "link_kind";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "link_href";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "condition_match";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "importance";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "delay_seconds";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "policy_kind";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "policy_repeat_after_hours";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "policy_max_impressions";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "policy_outcome";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "policy_dwell_seconds";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "seed_key";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "created_by_id";
		ALTER TABLE "banners" DROP COLUMN IF EXISTS "updated_by_id";
	`);

	await db.execute(sql`
		DROP TYPE IF EXISTS "enum_banners_content_image_mode";
		DROP TYPE IF EXISTS "enum_banners_cta_kind";
		DROP TYPE IF EXISTS "enum_banners_link_kind";
		DROP TYPE IF EXISTS "enum_banners_condition_match";
		DROP TYPE IF EXISTS "enum_banners_importance";
		DROP TYPE IF EXISTS "enum_banners_policy_kind";
		DROP TYPE IF EXISTS "enum_banners_policy_outcome";
		DROP TYPE IF EXISTS "enum_banners_blocks_order_count_scope";
		DROP TYPE IF EXISTS "enum_banners_blocks_cart_state";
		DROP TYPE IF EXISTS "enum_banners_blocks_action_action";
		DROP TYPE IF EXISTS "enum_banner_states_status";
		DROP TYPE IF EXISTS "enum_banner_states_last_close_method";
		DROP TYPE IF EXISTS "enum_banner_events_kind";
		DROP TYPE IF EXISTS "enum_banner_events_close_method";
	`);

	await db.execute(sql`
		ALTER TABLE "banners" ALTER COLUMN "status" DROP DEFAULT;
		ALTER TABLE "banners" ALTER COLUMN "status" TYPE text USING 'draft';
		DROP TYPE IF EXISTS "enum_banners_status";
		CREATE TYPE "enum_banners_status" AS ENUM ('draft', 'active', 'scheduled', 'archived');
		ALTER TABLE "banners"
			ALTER COLUMN "status" TYPE "enum_banners_status" USING "status"::"enum_banners_status";
		ALTER TABLE "banners" ALTER COLUMN "status" SET DEFAULT 'draft';
		ALTER TABLE "banners" ALTER COLUMN "status" DROP NOT NULL;

		CREATE TYPE "enum_banners_action" AS ENUM ('none', 'link', 'modal', 'redirect');
		CREATE TYPE "enum_banners_targeting_roles" AS ENUM ('user', 'lawyer', 'admin', 'moderator');

		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "action" "enum_banners_action" DEFAULT 'none';
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "action_payload" varchar;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "repeatable" boolean DEFAULT false;
		ALTER TABLE "banners" ADD COLUMN IF NOT EXISTS "_status" "enum_banners_status" DEFAULT 'draft';
		CREATE INDEX IF NOT EXISTS "banners__status_idx" ON "banners" USING btree ("_status");

		CREATE TABLE IF NOT EXISTS "banners_targeting_roles" (
			"order" integer NOT NULL,
			"parent_id" integer NOT NULL,
			"value" "enum_banners_targeting_roles",
			"id" serial PRIMARY KEY NOT NULL
		);
		ALTER TABLE "banners_targeting_roles" ADD CONSTRAINT "banners_targeting_roles_parent_fk"
			FOREIGN KEY ("parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		CREATE INDEX IF NOT EXISTS "banners_targeting_roles_order_idx" ON "banners_targeting_roles" USING btree ("order");
		CREATE INDEX IF NOT EXISTS "banners_targeting_roles_parent_idx" ON "banners_targeting_roles" USING btree ("parent_id");

		CREATE TABLE IF NOT EXISTS "banners_rels" (
			"id" serial PRIMARY KEY NOT NULL,
			"order" integer,
			"parent_id" integer NOT NULL,
			"path" varchar NOT NULL,
			"media_id" integer
		);
		ALTER TABLE "banners_rels" ADD CONSTRAINT "banners_rels_parent_fk"
			FOREIGN KEY ("parent_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
		ALTER TABLE "banners_rels" ADD CONSTRAINT "banners_rels_media_fk"
			FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
		CREATE INDEX IF NOT EXISTS "banners_rels_order_idx" ON "banners_rels" USING btree ("order");
		CREATE INDEX IF NOT EXISTS "banners_rels_parent_idx" ON "banners_rels" USING btree ("parent_id");
		CREATE INDEX IF NOT EXISTS "banners_rels_path_idx" ON "banners_rels" USING btree ("path");
		CREATE INDEX IF NOT EXISTS "banners_rels_media_id_idx" ON "banners_rels" USING btree ("media_id");
	`);
}
