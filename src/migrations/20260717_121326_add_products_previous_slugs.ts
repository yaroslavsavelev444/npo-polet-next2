import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "products_previous_slugs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"slug" varchar
  );
  
  CREATE TABLE "_products_v_version_previous_slugs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "products_previous_slugs" ADD CONSTRAINT "products_previous_slugs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_products_v_version_previous_slugs" ADD CONSTRAINT "_products_v_version_previous_slugs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_products_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "products_previous_slugs_order_idx" ON "products_previous_slugs" USING btree ("_order");
  CREATE INDEX "products_previous_slugs_parent_id_idx" ON "products_previous_slugs" USING btree ("_parent_id");
  CREATE INDEX "_products_v_version_previous_slugs_order_idx" ON "_products_v_version_previous_slugs" USING btree ("_order");
  CREATE INDEX "_products_v_version_previous_slugs_parent_id_idx" ON "_products_v_version_previous_slugs" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "products_previous_slugs" CASCADE;
  DROP TABLE "_products_v_version_previous_slugs" CASCADE;`)
}
