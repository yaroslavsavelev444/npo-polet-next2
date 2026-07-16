import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { upsertByLegacyId } from "./db-migrate/core/upsert.ts";
import type { MigrationContext } from "./db-migrate/core/types.ts";

const LID = "eeeeeeeeeeeeeeeeeeeeee01";

function makeCtx(payload: any): MigrationContext {
	const noop = () => {};
	return {
		payload, legacyDb: null as any, dryRun: false, verbose: false,
		log: { info: noop, warn: noop, error: noop, debug: noop } as any,
		getIdMap: async () => new Map(),
	} as MigrationContext;
}

async function main() {
	const payload = await getPayload({ config });
	const ctx = makeCtx(payload);
	const { docs: prods } = await payload.find({ collection: "products", limit: 1, overrideAccess: true });
	const { docs: users } = await payload.find({ collection: "users", where: { email: { equals: "victim@example.com" } }, limit: 1, overrideAccess: true });

	for (const d of (await payload.find({ collection: "orders", where: { legacyId: { equals: LID } }, limit: 5, overrideAccess: true })).docs) {
		await payload.delete({ collection: "orders", id: d.id, overrideAccess: true });
	}

	const LEGACY_CREATED = "2024-03-15T10:20:30.000Z";
	const LEGACY_UPDATED = "2024-04-01T08:00:00.000Z";

	const data = {
		user: Number(users[0].id),
		status: "pending",
		recipient: { fullName: "Проба", phone: "+7", email: "p@example.com" },
		delivery: { method: "self_pickup" },
		items: [{ product: Number(prods[0].id), name: "Товар", quantity: 1, unitPrice: 100, discount: 0, totalPrice: 100 }],
		pricing: { subtotal: 100, total: 100, currency: "RUB" },
		payment: { method: "invoice", status: "pending" },
		createdAt: LEGACY_CREATED,
		// updatedAt намеренно НЕ передаём — см. результат прошлой пробы
	};

	// прогон 1 — создание
	const r1 = await upsertByLegacyId({
		ctx, collection: "orders", legacyId: LID,
		createOnlyData: async () => ({ orderNumber: `PROBE-UPD-${Date.now()}` }),
		data, context: { isMigration: true },
	});
	const o1 = await payload.findByID({ collection: "orders", id: r1.id!, overrideAccess: true, depth: 0 });
	console.log(`\n[прогон 1] ${r1.action}: createdAt=${o1.createdAt}, updatedAt=${o1.updatedAt}`);

	// прогон 2 — ничего не менялось: должен быть unchanged, иначе вечная «обновляловка»
	const r2 = await upsertByLegacyId({
		ctx, collection: "orders", legacyId: LID,
		createOnlyData: async () => ({ orderNumber: "НЕ ПРИМЕНИТСЯ" }),
		data, context: { isMigration: true },
	});
	const o2 = await payload.findByID({ collection: "orders", id: r1.id!, overrideAccess: true, depth: 0 });
	console.log(`[прогон 2] ${r2.action}: createdAt=${o2.createdAt}, updatedAt=${o2.updatedAt}`);
	console.log(`           -> ${r2.action === "unchanged" ? "СТАБИЛЬНО ✅ (повторный прогон не трогает заказ)" : "ЧУРН ❌ (каждый прогон переписывает все заказы)"}`);

	// прогон 3 — имитируем изменение статуса в старой БД, чтобы проверить,
	// что updatedAt не «залипает» и апдейт вообще проходит
	const r3 = await upsertByLegacyId({
		ctx, collection: "orders", legacyId: LID,
		createOnlyData: async () => ({ orderNumber: "НЕ ПРИМЕНИТСЯ" }),
		data: { ...data, status: "delivered" }, context: { isMigration: true },
	});
	const o3 = await payload.findByID({ collection: "orders", id: r1.id!, overrideAccess: true, depth: 0 });
	console.log(`[прогон 3] статус изменился в старой БД: ${r3.action}, status=${o3.status}, updatedAt=${o3.updatedAt}`);
	console.log(`           -> updatedAt ${o3.updatedAt === LEGACY_UPDATED ? "остался легаси ✅" : "перезаписан Payload'ом"}`);

	// прогон 4 — снова без изменений (после реального апдейта)
	const r4 = await upsertByLegacyId({
		ctx, collection: "orders", legacyId: LID,
		createOnlyData: async () => ({ orderNumber: "НЕ ПРИМЕНИТСЯ" }),
		data: { ...data, status: "delivered" }, context: { isMigration: true },
	});
	console.log(`[прогон 4] ${r4.action} -> ${r4.action === "unchanged" ? "СТАБИЛЬНО ✅" : "ЧУРН ❌"}`);

	await payload.delete({ collection: "orders", id: r1.id!, overrideAccess: true });
	console.log("\n(пробный заказ удалён)");
	process.exit(0);
}

main();
