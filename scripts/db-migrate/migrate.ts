// // scripts/migrate-users.ts

// import fs from "fs/promises";
// import path from "path";
// import { getPayload } from "payload";
// import configPromise from "@/payloadconfig";

// async function migrateUsersFromFile() {
//   console.log("🚀 Запуск миграции пользователей...");

//   const payload = await getPayload({ config: await configPromise });

//   const filePath = path.resolve("./users_export.json");
//   const rawData = await fs.readFile(filePath, "utf-8");

//   // Поддержка двух форматов: jsonArray и NDJSON
//   let oldUsers: any[];
//   try {
//     oldUsers = JSON.parse(rawData);
//     if (!Array.isArray(oldUsers)) {
//       // NDJSON
//       oldUsers = rawData
//         .trim()
//         .split("\n")
//         .filter(Boolean)
//         .map((line) => JSON.parse(line));
//     }
//   } catch (e) {
//     console.error("❌ Ошибка парсинга файла");
//     process.exit(1);
//   }

//   let migrated = 0;
//   let skipped = 0;
//   let failed = 0;
//   const batchSize = 150;

//   for (let i = 0; i < oldUsers.length; i += batchSize) {
//     const batch = oldUsers.slice(i, i + batchSize);

//     for (const old of batch) {
//       try {
//         // Проверка дубликата по email
//         const existing = await payload.find({
//           collection: "users",
//           where: { email: { equals: old.email } },
//           limit: 1,
//         });

//         if (existing.docs.length > 0) {
//           skipped++;
//           continue;
//         }

//         const newUser = {
//           email: old.email,
//           password: old.password, // ← bcrypt hash
//           name: old.name,
//           role: old.role || "user",
//           status: old.status || "active",
//           blockedUntil: old.blockedUntil || null,
//           lastLoginAt: old.updatedAt || null,
//           loginAttempts: 0,
//           emailVerified: true, // можно сделать false, если нужно
//           // legacyId: old._id?.$oid || old._id,     // раскомментируй если нужно
//         };

//         await payload.create({
//           collection: "users",
//           data: newUser,
//           overrideAccess: true,
//         });

//         migrated++;
//         if (migrated % 50 === 0) {
//           console.log(`✅ Прогресс: ${migrated} пользователей мигрировано`);
//         }
//       } catch (err: any) {
//         failed++;
//         console.error(`❌ Ошибка ${old.email}:`, err.message);
//       }
//     }
//   }

//   console.log("\n🎉 Миграция завершена!");
//   console.log(`   Успешно: ${migrated}`);
//   console.log(`   Пропущено (уже существуют): ${skipped}`);
//   console.log(`   Ошибок: ${failed}`);
// }
//
// migrateUsersFromFile().catch((err) => {
//   console.error("💥 Критическая ошибка:", err);
//   process.exit(1);
// });
