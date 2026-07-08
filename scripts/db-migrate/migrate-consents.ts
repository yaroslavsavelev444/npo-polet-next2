// scripts/migrate-consents.ts

import { createHash } from "node:crypto";
import fs from "fs/promises";
import path from "path";
import { getPayload } from "payload";
import configPromise from "@/payloadconfig";

async function migrateConsentsFromFile() {
  console.log("🚀 Запуск миграции соглашений (Consents)...");

  const payload = await getPayload({ config: await configPromise });

  const filePath = path.resolve("./consents_export.json");
  const rawData = await fs.readFile(filePath, "utf-8");

  let oldConsents: any[];
  try {
    oldConsents = JSON.parse(rawData);
    if (!Array.isArray(oldConsents)) {
      oldConsents = rawData
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  } catch (e) {
    console.error("❌ Ошибка парсинга файла consents_export.json");
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const batchSize = 50;

  for (let i = 0; i < oldConsents.length; i += batchSize) {
    const batch = oldConsents.slice(i, i + batchSize);

    for (const old of batch) {
      try {
        // Проверка по slug
        const exists = await payload.find({
          collection: "consents",
          where: { slug: { equals: old.slug } },
          limit: 1,
        });

        if (exists.docs.length > 0) {
          skipped++;
          continue;
        }

        // Подготовка истории (если есть)
        const history =
          old.history?.map((h: any) => ({
            version: h.version,
            content: h.content,
            documentUrl: h.documentUrl,
            changeDescription: h.changeDescription,
            createdAt: h.createdAt,
          })) || [];

        // Вычисляем checksum (как в новой модели)
        const checksum = createHash("sha256")
          .update(old.content || "")
          .digest("hex");

        const newConsent = {
          title: old.title,
          slug: old.slug,
          description: old.description,
          content: old.content,
          documentUrl: old.documentUrl,
          isRequired: old.isRequired ?? true,
          needsAcceptance: old.needsAcceptance ?? true,
          isActive: old.isActive ?? true,
          version: old.version || "1.0.0",
          checksum: checksum,
          lastUpdatedAt: old.lastUpdatedAt || old.updatedAt,
          lastUpdatedBy: old.lastUpdatedBy, // ObjectId — если нужно, маппируем позже
          history: history,
        };

        await payload.create({
          collection: "consents",
          data: newConsent,
          overrideAccess: true,
        });

        migrated++;
        if (migrated % 20 === 0) {
          console.log(`✅ Мигрировано соглашений: ${migrated}`);
        }
      } catch (err: any) {
        failed++;
        console.error(
          `❌ Ошибка соглашения ${old.slug || old.title}:`,
          err.message,
        );
      }
    }
  }

  console.log("\n🎉 Миграция соглашений завершена!");
  console.log(`   Успешно: ${migrated}`);
  console.log(`   Пропущено: ${skipped}`);
  console.log(`   Ошибок: ${failed}`);
}

migrateConsentsFromFile().catch(console.error);
