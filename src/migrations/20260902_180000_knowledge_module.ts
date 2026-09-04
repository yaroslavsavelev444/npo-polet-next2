import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Модуль «База знаний»: разделы, секции, черновики, rich text, рекомендации,
 * поисковый индекс.
 *
 * Схема сгенерирована `migrate:create` и вручную очищена от чужих изменений:
 * снапшот `20260717_121326_add_products_previous_slugs.json` устарел (после
 * него четыре миграции правили схему без обновления снапшота), поэтому
 * генератор дополнительно предлагал заново применить правки feedbacks,
 * orders, sessions, checkout_preferences и settings. Здесь оставлено только
 * то, что относится к базе знаний; снапшот рядом (.json) при этом полный и
 * корректный — он и приводит цепочку миграций в порядок для будущих
 * генераций.
 *
 * Данные не теряются. Что происходит с существующими статьями:
 *
 *  1. `published` (boolean) → `_status` черновиков Payload. true → published,
 *     false → draft. Само поле удаляется только после переноса значений.
 *  2. Блоки старого редактора (heading / text / image / link) собираются в
 *     lexical-документ в порядке `_order` и кладутся в новое поле `content`.
 *     Таблицы блоков удаляются только после конвертации.
 *  3. Раздел у статьи обязателен, а у старых статей его нет — поэтому при
 *     наличии материалов создаётся раздел «Материалы» (slug `materialy`), и
 *     все статьи без раздела попадают в него. Если статей нет, раздел не
 *     создаётся: пустой служебный раздел в админке никому не нужен.
 *  4. `search_text` заполняется из заголовка, описания и текста статьи, чтобы
 *     поиск работал по перенесённым материалам сразу, не дожидаясь
 *     пересохранения каждой из них в админке.
 */

// ── Конструкторы узлов lexical ──────────────────────────────────────────────
//
// Формат сериализации lexical стабилен и документирован структурой узлов;
// собираем минимально необходимый набор полей, который ожидают и редактор,
// и конвертеры рендера.

type LexicalChild = Record<string, unknown>;

function textNode(text: string): LexicalChild {
	return {
		type: "text",
		detail: 0,
		format: 0,
		mode: "normal",
		style: "",
		text,
		version: 1,
	};
}

function paragraphNode(text: string): LexicalChild {
	return {
		type: "paragraph",
		children: text ? [textNode(text)] : [],
		direction: "ltr",
		format: "",
		indent: 0,
		textFormat: 0,
		textStyle: "",
		version: 1,
	};
}

function headingNode(text: string): LexicalChild {
	return {
		type: "heading",
		tag: "h2",
		children: [textNode(text)],
		direction: "ltr",
		format: "",
		indent: 0,
		version: 1,
	};
}

function uploadNode(mediaId: number, caption: string | null): LexicalChild {
	return {
		type: "upload",
		relationTo: "media",
		value: mediaId,
		fields: caption ? { caption } : null,
		format: "",
		version: 3,
	};
}

function linkParagraphNode(label: string, url: string): LexicalChild {
	return {
		type: "paragraph",
		children: [
			{
				type: "link",
				children: [textNode(label)],
				direction: "ltr",
				fields: {
					linkType: "custom",
					newTab: true,
					url,
				},
				format: "",
				indent: 0,
				version: 3,
			},
		],
		direction: "ltr",
		format: "",
		indent: 0,
		textFormat: 0,
		textStyle: "",
		version: 1,
	};
}

function lexicalDocument(children: LexicalChild[]) {
	return {
		root: {
			type: "root",
			children: children.length > 0 ? children : [paragraphNode("")],
			direction: "ltr",
			format: "",
			indent: 0,
			version: 1,
		},
	};
}

interface BlockRow {
	parent_id: number;
	order: number;
	kind: "heading" | "text" | "image" | "link";
	text: string | null;
	image_id: number | null;
	caption: string | null;
	url: string | null;
}

function blockToNodes(block: BlockRow): LexicalChild[] {
	switch (block.kind) {
		case "heading":
			return block.text ? [headingNode(block.text)] : [];

		case "text":
			// Старое поле было textarea: абзацы в нём разделялись переводами
			// строки, и без разбиения весь текст слипся бы в один абзац.
			return (block.text ?? "")
				.split(/\n{2,}|\n/)
				.map((line) => line.trim())
				.filter(Boolean)
				.map(paragraphNode);

		case "image":
			return block.image_id ? [uploadNode(block.image_id, block.caption)] : [];

		case "link":
			return block.url
				? [linkParagraphNode(block.text || block.url, block.url)]
				: [];

		default:
			return [];
	}
}

/** Плоский текст для поискового индекса — тот же принцип, что в indexKnowledgeTopic. */
function plaintextOf(nodes: LexicalChild[]): string {
	const parts: string[] = [];

	const walk = (node: LexicalChild) => {
		if (typeof node.text === "string") parts.push(node.text);
		if (Array.isArray(node.children)) {
			for (const child of node.children as LexicalChild[]) walk(child);
		}
	};

	for (const node of nodes) walk(node);
	return parts.join(" ").replace(/\s+/g, " ").trim();
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
	// ── 1. Схема ────────────────────────────────────────────────────────────
	await db.execute(sql`
    CREATE TYPE "public"."enum_knowledge_topics_status" AS ENUM('draft', 'published');
    CREATE TYPE "public"."enum__knowledge_topics_v_version_status" AS ENUM('draft', 'published');
    CREATE TYPE "public"."enum__knowledge_topics_v_published_locale" AS ENUM('ru', 'en');

    CREATE TABLE "knowledge_categories" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "description" varchar,
      "order" numeric DEFAULT 0,
      "is_active" boolean DEFAULT true,
      "seo_meta_title" varchar,
      "seo_meta_description" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "knowledge_categories_previous_slugs" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "slug" varchar
    );

    CREATE TABLE "knowledge_sections" (
      "id" serial PRIMARY KEY NOT NULL,
      "title" varchar NOT NULL,
      "category_id" integer NOT NULL,
      "slug" varchar NOT NULL,
      "description" varchar,
      "order" numeric DEFAULT 0,
      "is_active" boolean DEFAULT true,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE "knowledge_topics_previous_slugs" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "slug" varchar
    );

    CREATE TABLE "knowledge_topics_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "knowledge_topics_id" integer
    );

    CREATE TABLE "_knowledge_topics_v" (
      "id" serial PRIMARY KEY NOT NULL,
      "parent_id" integer,
      "version_title" varchar,
      "version_description" varchar,
      "version_content" jsonb,
      "version_category_id" integer,
      "version_section_id" integer,
      "version_image_id" integer,
      "version_seo_meta_title" varchar,
      "version_seo_meta_description" varchar,
      "version_seo_og_image_id" integer,
      "version_slug" varchar,
      "version_position" numeric DEFAULT 0,
      "version_featured" boolean DEFAULT false,
      "version_published_at" timestamp(3) with time zone,
      "version_author_id" integer,
      "version_reading_time" numeric,
      "version_search_text" varchar,
      "version_updated_at" timestamp(3) with time zone,
      "version_created_at" timestamp(3) with time zone,
      "version__status" "enum__knowledge_topics_v_version_status" DEFAULT 'draft',
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "snapshot" boolean,
      "published_locale" "enum__knowledge_topics_v_published_locale",
      "latest" boolean
    );

    CREATE TABLE "_knowledge_topics_v_version_tags" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "tag" varchar,
      "_uuid" varchar
    );

    CREATE TABLE "_knowledge_topics_v_version_previous_slugs" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "slug" varchar,
      "_uuid" varchar
    );

    CREATE TABLE "_knowledge_topics_v_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "knowledge_topics_id" integer
    );

    ALTER TABLE "knowledge_topics" ADD COLUMN "content" jsonb;
    ALTER TABLE "knowledge_topics" ADD COLUMN "category_id" integer;
    ALTER TABLE "knowledge_topics" ADD COLUMN "section_id" integer;
    ALTER TABLE "knowledge_topics" ADD COLUMN "search_text" varchar;
    ALTER TABLE "knowledge_topics" ADD COLUMN "_status" "enum_knowledge_topics_status" DEFAULT 'draft';

    -- Черновик по определению может быть недозаполнен, поэтому обязательность
    -- заголовка и адреса переезжает на уровень валидации Payload.
    ALTER TABLE "knowledge_topics" ALTER COLUMN "title" DROP NOT NULL;
    ALTER TABLE "knowledge_topics" ALTER COLUMN "slug" DROP NOT NULL;

    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "knowledge_categories_id" integer;
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "knowledge_sections_id" integer;
  `);

	await db.execute(sql`
    ALTER TABLE "knowledge_categories_previous_slugs" ADD CONSTRAINT "knowledge_categories_previous_slugs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "knowledge_sections" ADD CONSTRAINT "knowledge_sections_category_id_knowledge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "knowledge_topics_previous_slugs" ADD CONSTRAINT "knowledge_topics_previous_slugs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "knowledge_topics_rels" ADD CONSTRAINT "knowledge_topics_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "knowledge_topics_rels" ADD CONSTRAINT "knowledge_topics_rels_knowledge_topics_fk" FOREIGN KEY ("knowledge_topics_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v" ADD CONSTRAINT "_knowledge_topics_v_parent_id_knowledge_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v" ADD CONSTRAINT "_knowledge_topics_v_version_category_id_knowledge_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v" ADD CONSTRAINT "_knowledge_topics_v_version_section_id_knowledge_sections_id_fk" FOREIGN KEY ("version_section_id") REFERENCES "public"."knowledge_sections"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v" ADD CONSTRAINT "_knowledge_topics_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v" ADD CONSTRAINT "_knowledge_topics_v_version_seo_og_image_id_media_id_fk" FOREIGN KEY ("version_seo_og_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v" ADD CONSTRAINT "_knowledge_topics_v_version_author_id_users_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v_version_tags" ADD CONSTRAINT "_knowledge_topics_v_version_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_knowledge_topics_v"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v_version_previous_slugs" ADD CONSTRAINT "_knowledge_topics_v_version_previous_slugs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_knowledge_topics_v"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v_rels" ADD CONSTRAINT "_knowledge_topics_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_knowledge_topics_v"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "_knowledge_topics_v_rels" ADD CONSTRAINT "_knowledge_topics_v_rels_knowledge_topics_fk" FOREIGN KEY ("knowledge_topics_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "knowledge_topics" ADD CONSTRAINT "knowledge_topics_category_id_knowledge_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "knowledge_topics" ADD CONSTRAINT "knowledge_topics_section_id_knowledge_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."knowledge_sections"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_knowledge_categories_fk" FOREIGN KEY ("knowledge_categories_id") REFERENCES "public"."knowledge_categories"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_knowledge_sections_fk" FOREIGN KEY ("knowledge_sections_id") REFERENCES "public"."knowledge_sections"("id") ON DELETE cascade ON UPDATE no action;
  `);

	await db.execute(sql`
    CREATE INDEX "knowledge_categories_title_idx" ON "knowledge_categories" USING btree ("title");
    CREATE UNIQUE INDEX "knowledge_categories_slug_idx" ON "knowledge_categories" USING btree ("slug");
    CREATE INDEX "knowledge_categories_order_idx" ON "knowledge_categories" USING btree ("order");
    CREATE INDEX "knowledge_categories_is_active_idx" ON "knowledge_categories" USING btree ("is_active");
    CREATE INDEX "knowledge_categories_updated_at_idx" ON "knowledge_categories" USING btree ("updated_at");
    CREATE INDEX "knowledge_categories_created_at_idx" ON "knowledge_categories" USING btree ("created_at");
    CREATE INDEX "knowledge_categories_previous_slugs_order_idx" ON "knowledge_categories_previous_slugs" USING btree ("_order");
    CREATE INDEX "knowledge_categories_previous_slugs_parent_id_idx" ON "knowledge_categories_previous_slugs" USING btree ("_parent_id");
    CREATE INDEX "knowledge_sections_title_idx" ON "knowledge_sections" USING btree ("title");
    CREATE INDEX "knowledge_sections_category_idx" ON "knowledge_sections" USING btree ("category_id");
    CREATE UNIQUE INDEX "knowledge_sections_slug_idx" ON "knowledge_sections" USING btree ("slug");
    CREATE INDEX "knowledge_sections_order_idx" ON "knowledge_sections" USING btree ("order");
    CREATE INDEX "knowledge_sections_is_active_idx" ON "knowledge_sections" USING btree ("is_active");
    CREATE INDEX "knowledge_sections_updated_at_idx" ON "knowledge_sections" USING btree ("updated_at");
    CREATE INDEX "knowledge_sections_created_at_idx" ON "knowledge_sections" USING btree ("created_at");
    CREATE INDEX "knowledge_topics_previous_slugs_order_idx" ON "knowledge_topics_previous_slugs" USING btree ("_order");
    CREATE INDEX "knowledge_topics_previous_slugs_parent_id_idx" ON "knowledge_topics_previous_slugs" USING btree ("_parent_id");
    CREATE INDEX "knowledge_topics_rels_order_idx" ON "knowledge_topics_rels" USING btree ("order");
    CREATE INDEX "knowledge_topics_rels_parent_idx" ON "knowledge_topics_rels" USING btree ("parent_id");
    CREATE INDEX "knowledge_topics_rels_path_idx" ON "knowledge_topics_rels" USING btree ("path");
    CREATE INDEX "knowledge_topics_rels_knowledge_topics_id_idx" ON "knowledge_topics_rels" USING btree ("knowledge_topics_id");
    CREATE INDEX "_knowledge_topics_v_parent_idx" ON "_knowledge_topics_v" USING btree ("parent_id");
    CREATE INDEX "_knowledge_topics_v_version_version_title_idx" ON "_knowledge_topics_v" USING btree ("version_title");
    CREATE INDEX "_knowledge_topics_v_version_version_category_idx" ON "_knowledge_topics_v" USING btree ("version_category_id");
    CREATE INDEX "_knowledge_topics_v_version_version_section_idx" ON "_knowledge_topics_v" USING btree ("version_section_id");
    CREATE INDEX "_knowledge_topics_v_version_version_image_idx" ON "_knowledge_topics_v" USING btree ("version_image_id");
    CREATE INDEX "_knowledge_topics_v_version_seo_version_seo_og_image_idx" ON "_knowledge_topics_v" USING btree ("version_seo_og_image_id");
    CREATE INDEX "_knowledge_topics_v_version_version_slug_idx" ON "_knowledge_topics_v" USING btree ("version_slug");
    CREATE INDEX "_knowledge_topics_v_version_version_position_idx" ON "_knowledge_topics_v" USING btree ("version_position");
    CREATE INDEX "_knowledge_topics_v_version_version_featured_idx" ON "_knowledge_topics_v" USING btree ("version_featured");
    CREATE INDEX "_knowledge_topics_v_version_version_author_idx" ON "_knowledge_topics_v" USING btree ("version_author_id");
    CREATE INDEX "_knowledge_topics_v_version_version_search_text_idx" ON "_knowledge_topics_v" USING btree ("version_search_text");
    CREATE INDEX "_knowledge_topics_v_version_version_updated_at_idx" ON "_knowledge_topics_v" USING btree ("version_updated_at");
    CREATE INDEX "_knowledge_topics_v_version_version_created_at_idx" ON "_knowledge_topics_v" USING btree ("version_created_at");
    CREATE INDEX "_knowledge_topics_v_version_version__status_idx" ON "_knowledge_topics_v" USING btree ("version__status");
    CREATE INDEX "_knowledge_topics_v_created_at_idx" ON "_knowledge_topics_v" USING btree ("created_at");
    CREATE INDEX "_knowledge_topics_v_updated_at_idx" ON "_knowledge_topics_v" USING btree ("updated_at");
    CREATE INDEX "_knowledge_topics_v_snapshot_idx" ON "_knowledge_topics_v" USING btree ("snapshot");
    CREATE INDEX "_knowledge_topics_v_published_locale_idx" ON "_knowledge_topics_v" USING btree ("published_locale");
    CREATE INDEX "_knowledge_topics_v_latest_idx" ON "_knowledge_topics_v" USING btree ("latest");
    CREATE INDEX "_knowledge_topics_v_version_tags_order_idx" ON "_knowledge_topics_v_version_tags" USING btree ("_order");
    CREATE INDEX "_knowledge_topics_v_version_tags_parent_id_idx" ON "_knowledge_topics_v_version_tags" USING btree ("_parent_id");
    CREATE INDEX "_knowledge_topics_v_version_previous_slugs_order_idx" ON "_knowledge_topics_v_version_previous_slugs" USING btree ("_order");
    CREATE INDEX "_knowledge_topics_v_version_previous_slugs_parent_id_idx" ON "_knowledge_topics_v_version_previous_slugs" USING btree ("_parent_id");
    CREATE INDEX "_knowledge_topics_v_rels_order_idx" ON "_knowledge_topics_v_rels" USING btree ("order");
    CREATE INDEX "_knowledge_topics_v_rels_parent_idx" ON "_knowledge_topics_v_rels" USING btree ("parent_id");
    CREATE INDEX "_knowledge_topics_v_rels_path_idx" ON "_knowledge_topics_v_rels" USING btree ("path");
    CREATE INDEX "_knowledge_topics_v_rels_knowledge_topics_id_idx" ON "_knowledge_topics_v_rels" USING btree ("knowledge_topics_id");
    CREATE INDEX "knowledge_topics_category_idx" ON "knowledge_topics" USING btree ("category_id");
    CREATE INDEX "knowledge_topics_section_idx" ON "knowledge_topics" USING btree ("section_id");
    CREATE INDEX "knowledge_topics_featured_idx" ON "knowledge_topics" USING btree ("featured");
    CREATE INDEX "knowledge_topics_search_text_idx" ON "knowledge_topics" USING btree ("search_text");
    CREATE INDEX "knowledge_topics__status_idx" ON "knowledge_topics" USING btree ("_status");
    CREATE INDEX "payload_locked_documents_rels_knowledge_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("knowledge_categories_id");
    CREATE INDEX "payload_locked_documents_rels_knowledge_sections_id_idx" ON "payload_locked_documents_rels" USING btree ("knowledge_sections_id");
  `);

	// Полнотекстовый индекс для поиска по материалам.
	//
	// Конфигурация 'russian' входит в стандартную поставку Postgres (snowball),
	// расширений ставить не нужно. Без стемминга поиск был бы бесполезен на
	// русском: запрос «сети» не нашёл бы «сеть», «сушка» — «сушите», и человеку
	// пришлось бы угадывать падеж, в котором слово стоит в статье.
	//
	// btree-индекс на search_text, который сгенерировал Payload из `index: true`,
	// остаётся: он нужен подстрочным `like`-запросам, а этот — оператору @@.
	await db.execute(sql`
    CREATE INDEX "knowledge_topics_search_fts_idx"
      ON "knowledge_topics"
      USING gin (to_tsvector('russian', coalesce("search_text", '')));
  `);

	// ── 2. Перенос статуса публикации ───────────────────────────────────────
	await db.execute(sql`
    UPDATE "knowledge_topics"
    SET "_status" = CASE WHEN "published" IS TRUE THEN 'published'::"enum_knowledge_topics_status"
                         ELSE 'draft'::"enum_knowledge_topics_status" END;
  `);

	// ── 3. Раздел по умолчанию для перенесённых статей ──────────────────────
	const { rows: topicRows } = (await db.execute(sql`
    SELECT "id", "title", "description" FROM "knowledge_topics";
  `)) as unknown as {
		rows: Array<{
			id: number;
			title: string | null;
			description: string | null;
		}>;
	};

	if (topicRows.length > 0) {
		await db.execute(sql`
      INSERT INTO "knowledge_categories" ("title", "slug", "description", "order", "is_active")
      VALUES ('Материалы', 'materialy', 'Материалы, перенесённые из первой версии базы знаний. Разложите их по разделам и переименуйте этот раздел или удалите его.', 0, true)
      ON CONFLICT ("slug") DO NOTHING;
    `);

		await db.execute(sql`
      UPDATE "knowledge_topics"
      SET "category_id" = (SELECT "id" FROM "knowledge_categories" WHERE "slug" = 'materialy')
      WHERE "category_id" IS NULL;
    `);
	}

	// ── 4. Конвертация блоков в lexical + поисковый индекс ──────────────────
	const { rows: blockRows } = (await db.execute(sql`
    SELECT "_parent_id" AS parent_id, "_order" AS "order", 'heading' AS kind,
           "text" AS text, NULL::integer AS image_id, NULL::varchar AS caption, NULL::varchar AS url
    FROM "knowledge_topics_blocks_heading"
    UNION ALL
    SELECT "_parent_id", "_order", 'text', "content", NULL, NULL, NULL
    FROM "knowledge_topics_blocks_text"
    UNION ALL
    SELECT "_parent_id", "_order", 'image', NULL, "image_id", "caption", NULL
    FROM "knowledge_topics_blocks_image"
    UNION ALL
    SELECT "_parent_id", "_order", 'link', "label", NULL, NULL, "url"
    FROM "knowledge_topics_blocks_link"
    ORDER BY parent_id, "order";
  `)) as unknown as { rows: BlockRow[] };

	const byTopic = new Map<number, BlockRow[]>();
	for (const row of blockRows) {
		const list = byTopic.get(row.parent_id);
		if (list) list.push(row);
		else byTopic.set(row.parent_id, [row]);
	}

	for (const topic of topicRows) {
		const blocks = (byTopic.get(topic.id) ?? []).sort(
			(a, b) => a.order - b.order,
		);
		const nodes = blocks.flatMap(blockToNodes);

		const content = JSON.stringify(lexicalDocument(nodes));
		// Тот же формат, что пишет indexKnowledgeTopic: шапка, разделитель \u0007,
		// тело. Разделитель нужен выдаче поиска, чтобы фрагмент брался из текста
		// статьи, а не повторял её заголовок.
		const head = [topic.title ?? "", topic.description ?? ""]
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		const searchText = `${head} \u0007 ${plaintextOf(nodes)}`.slice(0, 30_000);

		await db.execute(sql`
      UPDATE "knowledge_topics"
      SET "content" = ${content}::jsonb,
          "search_text" = ${searchText}
      WHERE "id" = ${topic.id};
    `);
	}

	// ── 5. Удаление старой схемы ────────────────────────────────────────────
	// Только после того, как данные из неё перенесены выше.
	await db.execute(sql`
    DROP INDEX IF EXISTS "knowledge_topics_published_idx";
    ALTER TABLE "knowledge_topics" DROP COLUMN IF EXISTS "published";

    DROP TABLE IF EXISTS "knowledge_topics_blocks_heading" CASCADE;
    DROP TABLE IF EXISTS "knowledge_topics_blocks_text" CASCADE;
    DROP TABLE IF EXISTS "knowledge_topics_blocks_image" CASCADE;
    DROP TABLE IF EXISTS "knowledge_topics_blocks_link" CASCADE;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	// Откат восстанавливает структуру старого редактора и флаг публикации, но
	// НЕ разбирает lexical-документ обратно на блоки: обратное преобразование
	// с потерями (таблицы, врезки, видео старой схемой не выражаются), и
	// притворяться, что оно точное, было бы хуже, чем честно оставить контент
	// в поле `content` до повторного применения миграции.
	await db.execute(sql`
    ALTER TABLE "knowledge_topics" ADD COLUMN IF NOT EXISTS "published" boolean DEFAULT true;
    UPDATE "knowledge_topics" SET "published" = ("_status" = 'published');
    CREATE INDEX IF NOT EXISTS "knowledge_topics_published_idx" ON "knowledge_topics" USING btree ("published");

    CREATE TABLE IF NOT EXISTS "knowledge_topics_blocks_heading" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "text" varchar NOT NULL,
      "block_name" varchar
    );

    CREATE TABLE IF NOT EXISTS "knowledge_topics_blocks_text" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "content" varchar NOT NULL,
      "block_name" varchar
    );

    CREATE TABLE IF NOT EXISTS "knowledge_topics_blocks_image" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "image_id" integer,
      "caption" varchar,
      "block_name" varchar
    );

    CREATE TABLE IF NOT EXISTS "knowledge_topics_blocks_link" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL,
      "url" varchar NOT NULL,
      "block_name" varchar
    );

    ALTER TABLE "knowledge_topics_blocks_heading" ADD CONSTRAINT "knowledge_topics_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "knowledge_topics_blocks_text" ADD CONSTRAINT "knowledge_topics_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "knowledge_topics_blocks_image" ADD CONSTRAINT "knowledge_topics_blocks_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "knowledge_topics_blocks_image" ADD CONSTRAINT "knowledge_topics_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "knowledge_topics_blocks_link" ADD CONSTRAINT "knowledge_topics_blocks_link_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."knowledge_topics"("id") ON DELETE cascade ON UPDATE no action;

    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_heading_order_idx" ON "knowledge_topics_blocks_heading" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_heading_parent_id_idx" ON "knowledge_topics_blocks_heading" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_heading_path_idx" ON "knowledge_topics_blocks_heading" USING btree ("_path");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_text_order_idx" ON "knowledge_topics_blocks_text" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_text_parent_id_idx" ON "knowledge_topics_blocks_text" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_text_path_idx" ON "knowledge_topics_blocks_text" USING btree ("_path");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_image_order_idx" ON "knowledge_topics_blocks_image" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_image_parent_id_idx" ON "knowledge_topics_blocks_image" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_image_path_idx" ON "knowledge_topics_blocks_image" USING btree ("_path");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_image_image_idx" ON "knowledge_topics_blocks_image" USING btree ("image_id");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_link_order_idx" ON "knowledge_topics_blocks_link" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_link_parent_id_idx" ON "knowledge_topics_blocks_link" USING btree ("_parent_id");
    CREATE INDEX IF NOT EXISTS "knowledge_topics_blocks_link_path_idx" ON "knowledge_topics_blocks_link" USING btree ("_path");
  `);

	await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "knowledge_categories_id";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "knowledge_sections_id";

    ALTER TABLE "knowledge_topics" DROP COLUMN IF EXISTS "content";
    ALTER TABLE "knowledge_topics" DROP COLUMN IF EXISTS "category_id";
    ALTER TABLE "knowledge_topics" DROP COLUMN IF EXISTS "section_id";
    ALTER TABLE "knowledge_topics" DROP COLUMN IF EXISTS "search_text";
    ALTER TABLE "knowledge_topics" DROP COLUMN IF EXISTS "_status";

    DROP TABLE IF EXISTS "_knowledge_topics_v_rels" CASCADE;
    DROP TABLE IF EXISTS "_knowledge_topics_v_version_previous_slugs" CASCADE;
    DROP TABLE IF EXISTS "_knowledge_topics_v_version_tags" CASCADE;
    DROP TABLE IF EXISTS "_knowledge_topics_v" CASCADE;
    DROP TABLE IF EXISTS "knowledge_topics_rels" CASCADE;
    DROP TABLE IF EXISTS "knowledge_topics_previous_slugs" CASCADE;
    DROP TABLE IF EXISTS "knowledge_sections" CASCADE;
    DROP TABLE IF EXISTS "knowledge_categories_previous_slugs" CASCADE;
    DROP TABLE IF EXISTS "knowledge_categories" CASCADE;

    DROP TYPE IF EXISTS "public"."enum__knowledge_topics_v_published_locale";
    DROP TYPE IF EXISTS "public"."enum__knowledge_topics_v_version_status";
    DROP INDEX IF EXISTS "knowledge_topics_search_fts_idx";
    DROP TYPE IF EXISTS "public"."enum_knowledge_topics_status";

    ALTER TABLE "knowledge_topics" ALTER COLUMN "title" SET NOT NULL;
    ALTER TABLE "knowledge_topics" ALTER COLUMN "slug" SET NOT NULL;
  `);
}
