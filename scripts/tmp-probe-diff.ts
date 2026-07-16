import "dotenv/config";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { stableStringify } from "./db-migrate/core/hash.ts";

const LID = "eeeeeeeeeeeeeeeeeeeeee02";

async function main() {
	const payload = await getPayload({ config });
	const { docs: prods } = await payload.find({ collection: "products", limit: 1, overrideAccess: true });
	const { docs: users } = await payload.find({ collection: "users", where: { email: { equals: "victim@example.com" } }, limit: 1, overrideAccess: true });

	for (const d of (await payload.find({ collection: "orders", where: { legacyId: { equals: LID } }, limit: 5, overrideAccess: true })).docs) {
		await payload.delete({ collection: "orders", id: d.id, overrideAccess: true });
	}

	const desired: Record<string, unknown> = {
		user: Number(users[0].id),
		status: "pending",
		recipient: { fullName: "Проба", phone: "+7", email: "p@example.com", contactPerson: undefined },
		delivery: { method: "self_pickup", address: undefined, transportCompany: undefined, pickupPoint: undefined, trackingNumber: undefined, estimatedDelivery: undefined, notes: undefined },
		items: [{ product: Number(prods[0].id), name: "Товар", quantity: 1, unitPrice: 100, discount: 0, totalPrice: 100 }],
		pricing: { subtotal: 100, productDiscounts: 0, centralDiscountAmount: 0, centralDiscountPercent: 0, discount: 0, shippingCost: 0, total: 100, currency: "RUB" },
		payment: { method: "invoice", status: "pending", transactionId: undefined, paidAt: undefined },
		appliedDiscounts: [],
		companyInfo: undefined,
		notes: undefined,
		internalNotes: undefined,
		statusHistory: [],
		source: "web",
		ipAddress: undefined,
		userAgent: undefined,
		createdAt: "2024-03-15T10:20:30.000Z",
	};

	const created = await payload.create({
		collection: "orders",
		data: { ...desired, orderNumber: `PROBE-DIFF-${Date.now()}`, legacyId: LID } as any,
		overrideAccess: true, depth: 0, context: { isMigration: true },
	});

	const { docs } = await payload.find({
		collection: "orders", where: { legacyId: { equals: LID } }, limit: 1, depth: 0, overrideAccess: true,
	});
	const existing: any = docs[0];

	console.log("\nПоля, по которым hasChanges считает запись изменившейся:");
	let any = false;
	for (const key of Object.keys(desired)) {
		const a = stableStringify(existing[key]);
		const b = stableStringify(desired[key]);
		if (a !== b) {
			any = true;
			console.log(`\n  ▸ ${key}`);
			console.log(`      в БД:    ${a.slice(0, 160)}`);
			console.log(`      хотим:   ${b.slice(0, 160)}`);
		}
	}
	if (!any) console.log("  (нет — запись стабильна)");

	await payload.delete({ collection: "orders", id: created.id, overrideAccess: true });
	process.exit(0);
}

main();
