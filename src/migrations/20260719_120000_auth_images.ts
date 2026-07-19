import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "settings" ADD COLUMN "auth_images_login_image_id" integer;
  ALTER TABLE "settings" ADD COLUMN "auth_images_register_image_id" integer;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_auth_images_login_image_id_media_id_fk" FOREIGN KEY ("auth_images_login_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings" ADD CONSTRAINT "settings_auth_images_register_image_id_media_id_fk" FOREIGN KEY ("auth_images_register_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "settings_auth_images_auth_images_login_image_idx" ON "settings" USING btree ("auth_images_login_image_id");
  CREATE INDEX "settings_auth_images_auth_images_register_image_idx" ON "settings" USING btree ("auth_images_register_image_id");`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "settings" DROP CONSTRAINT "settings_auth_images_login_image_id_media_id_fk";
  ALTER TABLE "settings" DROP CONSTRAINT "settings_auth_images_register_image_id_media_id_fk";
  DROP INDEX "settings_auth_images_auth_images_login_image_idx";
  DROP INDEX "settings_auth_images_auth_images_register_image_idx";
  ALTER TABLE "settings" DROP COLUMN "auth_images_login_image_id";
  ALTER TABLE "settings" DROP COLUMN "auth_images_register_image_id";`);
}
