import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_settings_hero_background_type" AS ENUM('none', 'image', 'video');
  ALTER TYPE "public"."enum_media_type" ADD VALUE 'hero' BEFORE 'other';
  ALTER TABLE "settings" ADD COLUMN "hero_background_type" "enum_settings_hero_background_type" DEFAULT 'none';
  ALTER TABLE "settings" ADD COLUMN "hero_background_image_id" integer;
  ALTER TABLE "settings" ADD COLUMN "hero_background_video_id" integer;
  ALTER TABLE "settings" ADD COLUMN "hero_background_video_poster_id" integer;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_hero_background_image_id_media_id_fk" FOREIGN KEY ("hero_background_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_hero_background_video_id_media_id_fk" FOREIGN KEY ("hero_background_video_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_hero_background_video_poster_id_media_id_fk" FOREIGN KEY ("hero_background_video_poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "settings_hero_background_hero_background_image_idx" ON "settings" USING btree ("hero_background_image_id");
  CREATE INDEX "settings_hero_background_hero_background_video_idx" ON "settings" USING btree ("hero_background_video_id");
  CREATE INDEX "settings_hero_background_hero_background_video_poster_idx" ON "settings" USING btree ("hero_background_video_poster_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "settings" DROP CONSTRAINT "settings_hero_background_image_id_media_id_fk";
  
  ALTER TABLE "settings" DROP CONSTRAINT "settings_hero_background_video_id_media_id_fk";
  
  ALTER TABLE "settings" DROP CONSTRAINT "settings_hero_background_video_poster_id_media_id_fk";
  
  ALTER TABLE "media" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "media" ALTER COLUMN "type" SET DEFAULT 'product'::text;
  DROP TYPE "public"."enum_media_type";
  CREATE TYPE "public"."enum_media_type" AS ENUM('certificate', 'instruction', 'license', 'passport', 'product', 'other');
  ALTER TABLE "media" ALTER COLUMN "type" SET DEFAULT 'product'::"public"."enum_media_type";
  ALTER TABLE "media" ALTER COLUMN "type" SET DATA TYPE "public"."enum_media_type" USING "type"::"public"."enum_media_type";
  DROP INDEX "settings_hero_background_hero_background_image_idx";
  DROP INDEX "settings_hero_background_hero_background_video_idx";
  DROP INDEX "settings_hero_background_hero_background_video_poster_idx";
  ALTER TABLE "settings" DROP COLUMN "hero_background_type";
  ALTER TABLE "settings" DROP COLUMN "hero_background_image_id";
  ALTER TABLE "settings" DROP COLUMN "hero_background_video_id";
  ALTER TABLE "settings" DROP COLUMN "hero_background_video_poster_id";
  DROP TYPE "public"."enum_settings_hero_background_type";`)
}
