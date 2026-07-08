// scripts/migrate-carts.ts

import fs from "fs/promises";
import path from "path";
import { getPayload } from "payload";
import configPromise from "@/payloadconfig";

async function migrateCartsFromFile() {
  console.log("🚀 Запуск миграции корзин...");

  const payload = await getPayload({ config: await configPromise });

  const filePath = path.resolve("./carts_export.json");
  const rawData = await fs.readFile(filePath, "utf-8");

  let oldCarts: any[];
  try {
    oldCarts = JSON.parse(rawData);
    if (!Array.isArray(oldCarts)) {
      oldCarts = rawData
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  } catch (e) {
    console.error("❌ Ошибка парсинга файла carts_export.json");
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const batchSize = 100;

  for (let i = 0; i < oldCarts.length; i += batchSize) {
    const batch = oldCarts.slice(i, i + batchSize);

    for (const old of batch) {
      try {
        // Пропускаем, если корзина для этого пользователя уже существует
        const exists = await payload.find({
          collection: "carts",
          where: { user: { equals: old.user?.toString() } }, // временно по старому ObjectId
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
            `⚠️ Пользователь не найден для корзины (userId: ${old.user})`,
          );
          failed++;
          continue;
        }

        const newCart = {
          user: userId,
          items:
            old.items?.map((item: any) => ({
              product: item.product, // ObjectId из старой БД (нужна миграция products)
              quantity: item.quantity,
              addedAt: item.addedAt || new Date(),
            })) || [],
        };

        await payload.create({
          collection: "carts",
          data: newCart,
          overrideAccess: true,
        });

        migrated++;
        if (migrated % 50 === 0) {
          console.log(`✅ Мигрировано корзин: ${migrated}`);
        }
      } catch (err: any) {
        failed++;
        console.error(
          `❌ Ошибка корзины пользователя ${old.user}:`,
          err.message,
        );
      }
    }
  }

  console.log("\n🎉 Миграция корзин завершена!");
  console.log(`   Успешно: ${migrated}`);
  console.log(`   Пропущено: ${skipped}`);
  console.log(`   Ошибок: ${failed}`);
}

migrateCartsFromFile().catch(console.error);
