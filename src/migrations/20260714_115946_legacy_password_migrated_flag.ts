import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_notifications_type" ADD VALUE 'security';
  ALTER TYPE "public"."enum_notifications_type" ADD VALUE 'account';
  ALTER TABLE "users" ADD COLUMN "legacy_password_migrated" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "notifications" ALTER COLUMN "type" SET DEFAULT 'system'::text;
  DROP TYPE "public"."enum_notifications_type";
  CREATE TYPE "public"."enum_notifications_type" AS ENUM('system', 'subscription_match', 'chat', 'review', 'order', 'promotion', 'discount', 'product', 'login_from_new_device');
  ALTER TABLE "notifications" ALTER COLUMN "type" SET DEFAULT 'system'::"public"."enum_notifications_type";
  ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE "public"."enum_notifications_type" USING "type"::"public"."enum_notifications_type";
  ALTER TABLE "users" DROP COLUMN "legacy_password_migrated";`)
}
