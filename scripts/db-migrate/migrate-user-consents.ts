// scripts/migrate-user-consents.ts

import fs from "fs/promises";
import path from "path";
import { getPayload } from "payload";
import configPromise from "@/payloadconfig";

async function migrateUserConsentsFromFile() {
  console.log("🚀 Запуск миграции принятых соглашений (UserConsents)...");

  const payload = await getPayload({ config: await configPromise });

  const filePath = path.resolve("./user-consents_export.json");
  const rawData = await fs.readFile(filePath, "utf-8");

  let oldRecords: any[];
  try {
    oldRecords = JSON.parse(rawData);
    if (!Array.isArray(oldRecords)) {
      oldRecords = rawData
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  } catch (e) {
    console.error("❌ Ошибка парсинга файла user-consents_export.json");
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const batchSize = 150;

  for (let i = 0; i < oldRecords.length; i += batchSize) {
    const batch = oldRecords.slice(i, i + batchSize);

    for (const old of batch) {
      try {
        // Проверка уникальности (user + consentSlug + version)
        const exists = await payload.find({
          collection: "user-consents",
          where: {
            user: { equals: old.userId?.toString() },
            consentSlug: { equals: old.consentSlug },
            version: { equals: old.consentVersion },
          },
          limit: 1,
        });

        if (exists.docs.length > 0) {
          skipped++;
          continue;
        }

        // Находим пользователя по legacyId
        let userId: string | undefined;
        if (old.userId) {
          const userDoc = await payload.find({
            collection: "users",
            where: { legacyId: { equals: old.userId.toString() } },
            limit: 1,
          });
          userId = userDoc.docs[0]?.id;
        }

        if (!userId) {
          console.warn(
            `⚠️ Пользователь не найден (userId: ${old.userId}) для соглашения ${old.consentSlug}`,
          );
          failed++;
          continue;
        }

        // Находим consent по slug (опционально, для связи)
        let consentId: string | undefined;
        if (old.consentSlug) {
          const consentDoc = await payload.find({
            collection: "consents",
            where: { slug: { equals: old.consentSlug } },
            limit: 1,
          });
          consentId = consentDoc.docs[0]?.id;
        }

        const newRecord = {
          user: userId,
          consent: consentId || undefined,
          consentSlug: old.consentSlug,
          version: old.consentVersion,
          acceptedAt: old.acceptedAt || old.createdAt,
          ip: old.ip,
          userAgent: old.userAgent,
        };

        await payload.create({
          collection: "user-consents",
          data: newRecord,
          overrideAccess: true,
        });

        migrated++;
        if (migrated % 100 === 0) {
          console.log(`✅ Мигрировано записей: ${migrated}`);
        }
      } catch (err: any) {
        failed++;
        console.error(
          `❌ Ошибка записи (user: ${old.userId}, slug: ${old.consentSlug}):`,
          err.message,
        );
      }
    }
  }

  console.log("\n🎉 Миграция принятых соглашений завершена!");
  console.log(`   Успешно: ${migrated}`);
  console.log(`   Пропущено: ${skipped}`);
  console.log(`   Ошибок: ${failed}`);
}

migrateUserConsentsFromFile().catch(console.error);
