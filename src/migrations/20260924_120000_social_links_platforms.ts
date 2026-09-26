import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Площадки соцсетей в «Настройках сайта»: закрытый список без запрещённых в РФ.
 *
 * Было: telegram, whatsapp, vk, github, max, other. Стало: telegram, vk, max,
 * ok, rutube, dzen — у каждой свой знак в подвале.
 *
 *   • whatsapp — заблокирован в РФ;
 *   • github — не соцсеть компании, а «Другое» пропускало любую площадку со
 *     ссылкой, в том числе запрещённую, и выводилось безымянным значком.
 *
 * Значения из enum в Postgres не удаляются, поэтому тип пересобирается:
 * строки с выбывшими площадками удаляются, новый тип создаётся рядом, колонка
 * переводится на него через text, старый тип удаляется, новый получает его
 * имя. Имя типа — то, что Payload выводит из поля (`enum_settings_social_links_platform`).
 *
 * down возвращает прежний набор значений; удалённые строки не восстанавливает.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
	await db.execute(sql`
  DELETE FROM "settings_social_links"
   WHERE "platform"::text NOT IN ('telegram', 'vk', 'max', 'ok', 'rutube', 'dzen');

  CREATE TYPE "public"."enum_settings_social_links_platform_new" AS ENUM('telegram', 'vk', 'max', 'ok', 'rutube', 'dzen');

  ALTER TABLE "settings_social_links"
   ALTER COLUMN "platform" SET DATA TYPE "public"."enum_settings_social_links_platform_new"
   USING "platform"::text::"public"."enum_settings_social_links_platform_new";

  DROP TYPE "public"."enum_settings_social_links_platform";
  ALTER TYPE "public"."enum_settings_social_links_platform_new" RENAME TO "enum_settings_social_links_platform";`);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
	await db.execute(sql`
  DELETE FROM "settings_social_links"
   WHERE "platform"::text NOT IN ('telegram', 'vk', 'max');

  CREATE TYPE "public"."enum_settings_social_links_platform_old" AS ENUM('telegram', 'whatsapp', 'vk', 'github', 'max', 'other');

  ALTER TABLE "settings_social_links"
   ALTER COLUMN "platform" SET DATA TYPE "public"."enum_settings_social_links_platform_old"
   USING "platform"::text::"public"."enum_settings_social_links_platform_old";

  DROP TYPE "public"."enum_settings_social_links_platform";
  ALTER TYPE "public"."enum_settings_social_links_platform_old" RENAME TO "enum_settings_social_links_platform";`);
}
