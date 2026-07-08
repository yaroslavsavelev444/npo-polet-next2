// scripts/migrate-companies.ts

import fs from "fs/promises";
import path from "path";
import { getPayload } from "payload";
import configPromise from "@/payloadconfig";

async function migrateCompaniesFromFile() {
  console.log("🚀 Запуск миграции компаний...");

  const payload = await getPayload({ config: await configPromise });

  const filePath = path.resolve("./companies_export.json");
  const rawData = await fs.readFile(filePath, "utf-8");

  let oldCompanies: any[];
  try {
    oldCompanies = JSON.parse(rawData);
    if (!Array.isArray(oldCompanies)) {
      oldCompanies = rawData
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  } catch (e) {
    console.error("❌ Ошибка парсинга файла companies_export.json");
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const batchSize = 100;

  for (let i = 0; i < oldCompanies.length; i += batchSize) {
    const batch = oldCompanies.slice(i, i + batchSize);

    for (const old of batch) {
      try {
        // Проверка на существование (по taxNumber + user)
        const exists = await payload.find({
          collection: "companies",
          where: {
            taxNumber: { equals: old.taxNumber },
            user: { equals: old.user?.toString() },
          },
          limit: 1,
        });

        if (exists.docs.length > 0) {
          skipped++;
          continue;
        }

        // Находим пользователя по legacyId
        let userId: string | undefined;
        if (old.user) {
          const userDoc = await payload.find({
            collection: "users",
            where: { legacyId: { equals: old.user.toString() } },
            limit: 1,
          });
          userId = userDoc.docs[0]?.id;
        }

        if (!userId) {
          console.warn(
            `⚠️ Пользователь не найден для компании ${old.companyName} (user: ${old.user})`,
          );
          failed++;
          continue;
        }

        const newCompany = {
          user: userId,
          companyName: old.companyName,
          legalAddress: old.legalAddress,
          companyAddress: old.companyAddress,
          taxNumber: old.taxNumber?.replace(/\s/g, "") || old.taxNumber,
          contactPerson: old.contactPerson,
          phone: old.phone,
          email: old.email,
        };

        await payload.create({
          collection: "companies",
          data: newCompany,
          overrideAccess: true,
        });

        migrated++;
        if (migrated % 50 === 0) {
          console.log(`✅ Мигрировано компаний: ${migrated}`);
        }
      } catch (err: any) {
        failed++;
        console.error(
          `❌ Ошибка компании ${old.companyName || old.taxNumber}:`,
          err.message,
        );
      }
    }
  }

  console.log("\n🎉 Миграция компаний завершена!");
  console.log(`   Успешно: ${migrated}`);
  console.log(`   Пропущено: ${skipped}`);
  console.log(`   Ошибок: ${failed}`);
}

migrateCompaniesFromFile().catch(console.error);
