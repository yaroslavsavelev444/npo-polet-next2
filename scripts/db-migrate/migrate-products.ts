// // scripts/migrate-products.ts

// import fs from "fs/promises";
// import path from "path";
// import { getPayload } from "payload";
// import configPromise from "@/payloadconfig";

// async function migrateProductsFromFile() {
//   console.log("🚀 Запуск миграции продуктов...");

//   const payload = await getPayload({ config: await configPromise });

//   const filePath = path.resolve("./products_export.json");
//   const rawData = await fs.readFile(filePath, "utf-8");

//   let oldProducts: any[];
//   try {
//     oldProducts = JSON.parse(rawData);
//     if (!Array.isArray(oldProducts)) {
//       oldProducts = rawData
//         .trim()
//         .split("\n")
//         .filter(Boolean)
//         .map((line) => JSON.parse(line));
//     }
//   } catch (e) {
//     console.error("❌ Ошибка парсинга файла products_export.json");
//     process.exit(1);
//   }

//   let migrated = 0;
//   let skipped = 0;
//   let failed = 0;
//   const batchSize = 80;

//   for (let i = 0; i < oldProducts.length; i += batchSize) {
//     const batch = oldProducts.slice(i, i + batchSize);

//     for (const old of batch) {
//       try {
//         // Проверка по SKU
//         const exists = await payload.find({
//           collection: "products",
//           where: { sku: { equals: old.sku } },
//           limit: 1,
//         });

//         if (exists.docs.length > 0) {
//           skipped++;
//           continue;
//         }

//         // Маппинг категории (если уже мигрировали категории)
//         let categoryId: string | undefined;
//         if (old.category) {
//           const cat = await payload.find({
//             collection: "categories",
//             where: { legacyId: { equals: old.category.toString() } },
//             limit: 1,
//           });
//           categoryId = cat.docs[0]?.id.toString();
//         }

//         const newProduct = {
//           sku: old.sku,
//           title: old.title, // можно добавить localized: { ru: old.title } если нужно
//           description: old.description,

//           category: categoryId || undefined,

//           pricing: {
//             priceForIndividual: old.priceForIndividual,
//             discount: {
//               isActive: old.discount?.isActive || false,
//               type: old.discount?.percentage ? "percentage" : "fixed",
//               value: old.discount?.percentage || old.discount?.amount || 0,
//               validFrom: old.discount?.validFrom,
//               validUntil: old.discount?.validUntil,
//               minQuantity: old.discount?.minQuantity || 1,
//             },
//           },

//           inventory: {
//             status: mapProductStatus(old.status),
//             minOrderQuantity: old.minOrderQuantity || 1,
//             maxOrderQuantity: old.maxOrderQuantity,
//             isVisible: old.isVisible ?? true,
//             showOnMainPage: old.showOnMainPage ?? false,
//           },

//           instruction: {
//             type: old.instruction?.type || "link",
//             file: old.instruction?.file, // ObjectId → media
//             link: old.instruction?.link || old.instruction?.url,
//           },

//           specifications:
//             old.specifications?.map((spec: any) => ({
//               name: spec.name,
//               value: spec.value?.toString() || "",
//               unit: spec.unit,
//               group: spec.group,
//               isVisible: spec.isVisible ?? true,
//             })) || [],

//           relations: {
//             upsellProducts: old.upsellProducts || [],
//             // relatedProducts / crossSellProducts можно добавить позже
//           },

//           brand: {
//             manufacturer: old.manufacturer,
//             warrantyMonths: old.warrantyMonths,
//           },

//           dimensions: {
//             weight: old.weight,
//             length: old.dimensions?.length,
//             width: old.dimensions?.width,
//             height: old.dimensions?.height,
//           },

//           seo: {
//             metaTitle: old.metaTitle,
//             metaDescription: old.metaDescription,
//             keywords: old.keywords?.map((k: string) => ({ keyword: k })) || [],
//           },

//           analytics: {
//             viewsCount: old.viewsCount || 0,
//             purchasesCount: old.purchasesCount || 0,
//           },

//           // legacyId: old._id?.$oid || old._id,   // раскомментируй если нужно
//         };

//         await payload.create({
//           collection: "products",
//           data: newProduct,
//           overrideAccess: true,
//           draft: false, // или true, если хочешь как draft
//         });

//         migrated++;
//         if (migrated % 30 === 0) {
//           console.log(`✅ Мигрировано продуктов: ${migrated}`);
//         }
//       } catch (err: any) {
//         failed++;
//         console.error(
//           `❌ Ошибка продукта ${old.sku || old.title}:`,
//           err.message,
//         );
//       }
//     }
//   }

//   console.log("\n🎉 Миграция продуктов завершена!");
//   console.log(`   Успешно: ${migrated}`);
//   console.log(`   Пропущено: ${skipped}`);
//   console.log(`   Ошибок: ${failed}`);
// }

// // Вспомогательная функция маппинга статусов
// function mapProductStatus(oldStatus: string): string {
//   const statusMap: Record<string, string> = {
//     available: "available",
//     preorder: "preorder",
//     out_of_stock: "out_of_stock",
//     discontinued: "discontinued",
//     // добавь свои если есть
//   };
//   return statusMap[oldStatus] || "available";
// }

// migrateProductsFromFile().catch(console.error);
