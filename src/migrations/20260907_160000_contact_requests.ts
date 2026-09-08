import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Коллекция `contact-requests` — сообщения с формы на странице контактов.
 *
 * Почему отдельная таблица, а не расширение `feedbacks`, объяснено в
 * докстринге самой коллекции (src/payload/collections/ContactRequests.ts):
 * коротко — это разные потоки с разными адресатами внутри компании.
 *
 * `consent_accepted_at` объявлена NOT NULL сознательно. Согласие на обработку
 * персональных данных — обязательное условие приёма формы, и строка без
 * отметки времени означала бы, что обращение принято без согласия. Такую
 * строку лучше не уметь создавать вовсе, чем потом искать её глазами.
 *
 * Индексы ровно те, по которым коллекция реально фильтруется и сортируется в
 * админке: статус (вкладки «новые / в работе»), email (все обращения одного
 * отправителя) и даты (список по умолчанию отсортирован по created_at).
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
    CREATE TYPE "public"."enum_contact_requests_status" AS ENUM('new', 'in_progress', 'done');
  `);

	await db.execute(sql`
    CREATE TABLE "contact_requests" (
    	"id" serial PRIMARY KEY NOT NULL,
    	"name" varchar NOT NULL,
    	"email" varchar NOT NULL,
    	"message" varchar NOT NULL,
    	"status" "enum_contact_requests_status" DEFAULT 'new',
    	"consent_accepted_at" timestamp(3) with time zone NOT NULL,
    	"consent_document" varchar,
    	"user_agent" varchar,
    	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `);

	await db.execute(sql`
    CREATE INDEX "contact_requests_email_idx" ON "contact_requests" USING btree ("email");
    CREATE INDEX "contact_requests_status_idx" ON "contact_requests" USING btree ("status");
    CREATE INDEX "contact_requests_updated_at_idx" ON "contact_requests" USING btree ("updated_at");
    CREATE INDEX "contact_requests_created_at_idx" ON "contact_requests" USING btree ("created_at");
  `);

	// Payload держит блокировки редактирования одной общей таблицей связей:
	// у каждой коллекции в ней своя колонка. Без неё админка падает при
	// открытии документа на редактирование.
	await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "contact_requests_id" integer;
  `);

	await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      ADD CONSTRAINT "payload_locked_documents_rels_contact_requests_fk"
      FOREIGN KEY ("contact_requests_id") REFERENCES "public"."contact_requests"("id")
      ON DELETE cascade ON UPDATE no action;
  `);

	await db.execute(sql`
    CREATE INDEX "payload_locked_documents_rels_contact_requests_id_idx"
      ON "payload_locked_documents_rels" USING btree ("contact_requests_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
    DROP INDEX IF EXISTS "payload_locked_documents_rels_contact_requests_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_contact_requests_fk";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "contact_requests_id";
  `);

	await db.execute(sql`
    DROP TABLE IF EXISTS "contact_requests" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_contact_requests_status";
  `);
}
