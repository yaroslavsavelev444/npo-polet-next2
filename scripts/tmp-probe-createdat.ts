import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";

/** Проверяем: принимает ли Payload createdAt на create и на update. */
async function main() {
	const payload = await getPayload({ config });
	const { docs: prods } = await payload.find({ collection: "products", limit: 1, overrideAccess: true });
	const { docs: users } = await payload.find({ collection: "users", where: { email: { equals: "victim@example.com" } }, limit: 1, overrideAccess: true });

	const base = {
		user: Number(users[0].id),
		status: "pending" as const,
		recipient: { fullName: "Проба Даты", phone: "+70000000000", email: "p@example.com" },
		delivery: { method: "self_pickup" as const },
		items: [{ product: Number(prods[0].id), name: "Товар", quantity: 1, unitPrice: 100, discount: 0, totalPrice: 100 }],
		pricing: { subtotal: 100, total: 100, currency: "RUB" },
		payment: { method: "invoice" as const, status: "pending" as const },
	};

	const LEGACY_CREATED = "2024-03-15T10:20:30.000Z";
	const LEGACY_UPDATED = "2024-04-01T08:00:00.000Z";

	// 1) CREATE с явным createdAt
	const created = await payload.create({
		collection: "orders",
		data: { ...base, orderNumber: `PROBE-CREATE-${Date.now()}`, createdAt: LEGACY_CREATED, updatedAt: LEGACY_UPDATED } as any,
		overrideAccess: true,
		context: { isMigration: true },
	});
	console.log(`\n[create] передали createdAt=${LEGACY_CREATED}`);
	console.log(`         получили createdAt=${created.createdAt} -> ${created.createdAt === LEGACY_CREATED ? "ПРИНЯТ ✅" : "ПРОИГНОРИРОВАН ❌"}`);
	console.log(`         updatedAt=${created.updatedAt} -> ${created.updatedAt === LEGACY_UPDATED ? "принят" : "перезаписан"}`);

	// 2) UPDATE существующей записи: можно ли ИСПРАВИТЬ дату уже перенесённого заказа
	const wrong = await payload.create({
		collection: "orders",
		data: { ...base, orderNumber: `PROBE-UPDATE-${Date.now()}` } as any,
		overrideAccess: true,
		context: { isMigration: true },
	});
	console.log(`\n[update] заказ создан с датой миграции: ${wrong.createdAt}`);

	const fixed = await payload.update({
		collection: "orders",
		id: wrong.id,
		data: { createdAt: LEGACY_CREATED } as any,
		overrideAccess: true,
		context: { isMigration: true },
	});
	console.log(`         после update({createdAt}): ${fixed.createdAt} -> ${fixed.createdAt === LEGACY_CREATED ? "ИСПРАВЛЕН ✅" : "НЕ ПРИМЕНИЛСЯ ❌"}`);

	// 3) Что реально в БД (а не в ответе Payload)
	const rows: any = await payload.db.drizzle.execute(
		`SELECT order_number, created_at, updated_at FROM orders WHERE order_number LIKE 'PROBE-%' ORDER BY id`,
	);
	console.log("\n[в БД]");
	for (const r of rows.rows ?? rows) {
		console.log(`  ${r.order_number}: created_at=${new Date(r.created_at).toISOString()}`);
	}

	// уборка
	for (const o of [created, wrong]) {
		await payload.delete({ collection: "orders", id: o.id, overrideAccess: true });
	}
	console.log("\n(пробные заказы удалены)");
	process.exit(0);
}

main();
