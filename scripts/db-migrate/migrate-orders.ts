// scripts/migrate-orders.ts

import fs from "fs/promises";
import path from "path";
import { getPayload } from "payload";
import configPromise from "@/payloadconfig";

async function migrateOrdersFromFile() {
  console.log("🚀 Запуск миграции заказов...");

  const payload = await getPayload({ config: await configPromise });

  const filePath = path.resolve("./orders_export.json");
  const rawData = await fs.readFile(filePath, "utf-8");

  let oldOrders: any[];
  try {
    oldOrders = JSON.parse(rawData);
    if (!Array.isArray(oldOrders)) {
      oldOrders = rawData
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  } catch (e) {
    console.error("❌ Ошибка парсинга файла orders_export.json");
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const batchSize = 50; // заказы тяжелее пользователей

  for (let i = 0; i < oldOrders.length; i += batchSize) {
    const batch = oldOrders.slice(i, i + batchSize);

    for (const old of batch) {
      try {
        // Пропускаем если уже существует
        const exists = await payload.find({
          collection: "orders",
          where: { orderNumber: { equals: old.orderNumber } },
          limit: 1,
        });

        if (exists.docs.length > 0) {
          skipped++;
          continue;
        }

        // Маппинг пользователя (по legacyId)
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
            `⚠️ Пользователь не найден для заказа ${old.orderNumber}, пропуск`,
          );
          failed++;
          continue;
        }

        const newOrder = {
          orderNumber: old.orderNumber, // оставляем старый, hook не сработает при override
          user: userId,
          status: old.status || "pending",

          recipient: {
            fullName: old.recipient?.fullName,
            phone: old.recipient?.phone,
            email: old.recipient?.email,
            contactPerson: old.recipient?.contactPerson,
          },

          delivery: {
            method: old.delivery?.method || "self_pickup",
            address: old.delivery?.address
              ? {
                  street: old.delivery.address.street,
                  city: old.delivery.address.city,
                  postalCode: old.delivery.address.postalCode,
                  country: old.delivery.address.country || "Россия",
                }
              : undefined,
            transportCompany: old.delivery?.transportCompany, // ObjectId → нужно будет мигрировать transport-companies
            pickupPoint: old.delivery?.pickupPoint, // аналогично
            trackingNumber: old.delivery?.trackingNumber,
            estimatedDelivery: old.delivery?.estimatedDelivery,
            notes: old.delivery?.notes,
          },

          items:
            old.items?.map((item: any) => ({
              product: item.product, // ObjectId → потребуется миграция products
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              totalPrice: item.totalPrice,
            })) || [],

          pricing: {
            subtotal: old.pricing?.subtotal || 0,
            productDiscounts: old.pricing?.productDiscounts || 0,
            centralDiscountAmount: old.pricing?.centralDiscountAmount || 0,
            centralDiscountPercent: old.pricing?.centralDiscountPercent || 0,
            discount: old.pricing?.discount || 0,
            shippingCost: old.pricing?.shippingCost || 0,
            total: old.pricing?.total || 0,
            currency: old.pricing?.currency || "RUB",
          },

          payment: {
            method: old.payment?.method,
            status: old.payment?.status || "pending",
            transactionId: old.payment?.transactionId,
            paidAt: old.payment?.paidAt,
          },

          appliedDiscounts:
            old.appliedDiscounts?.map((d: any) => ({
              discountId: d.discountId,
              name: d.name,
              discountPercent: d.discountPercent,
              discountAmount: d.discountAmount,
            })) || [],

          companyInfo: old.companyInfo
            ? {
                companyId: old.companyInfo.companyId,
                name: old.companyInfo.name,
                legalAddress:
                  old.companyInfo.legalAddress || old.companyInfo.address,
                companyAddress: old.companyInfo.companyAddress,
                taxNumber: old.companyInfo.taxNumber,
                contactPerson: old.companyInfo.contactPerson,
              }
            : undefined,

          notes: old.notes,
          internalNotes: old.internalNotes,
          statusHistory:
            old.statusHistory?.map((h: any) => ({
              status: h.status,
              changedAt: h.changedAt,
              changedBy: h.changedBy, // ObjectId
              comment: h.comment,
            })) || [],

          source: old.source || "web",
          ipAddress: old.ipAddress,
          userAgent: old.userAgent,
        };

        await payload.create({
          collection: "orders",
          data: newOrder,
          overrideAccess: true,
        });

        migrated++;
        if (migrated % 20 === 0)
          console.log(`✅ Мигрировано заказов: ${migrated}`);
      } catch (err: any) {
        failed++;
        console.error(`❌ Ошибка заказа ${old.orderNumber}:`, err.message);
      }
    }
  }

  console.log("\n🎉 Миграция заказов завершена!");
  console.log(`   Успешно: ${migrated}`);
  console.log(`   Пропущено: ${skipped}`);
  console.log(`   Ошибок: ${failed}`);
}

migrateOrdersFromFile().catch(console.error);
