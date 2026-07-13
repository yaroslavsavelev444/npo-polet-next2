// scripts/db-migrate/migrations/carts.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	resolveRef,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyCartItem {
	product: ObjectId;
	quantity: number;
	addedAt?: Date;
}

interface LegacyCart {
	_id: ObjectId;
	user: ObjectId;
	items?: LegacyCartItem[];
}

export default defineMigration({
	slug: "carts",
	dependsOn: ["users", "products"],
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyCart>(LEGACY_COLLECTIONS.carts)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const userId = await resolveRef(ctx, "users", old.user?.toString());
			if (!userId) {
				stats.skipped++;
				log.warn(`Корзина (${legacyId}): пользователь не найден, пропуск`);
				continue;
			}

			const items: Array<{
				product: string | number;
				quantity: number;
				addedAt?: string;
			}> = [];
			let unresolvedItems = 0;
			for (const item of old.items ?? []) {
				const productId = await resolveRef(
					ctx,
					"products",
					item.product?.toString(),
				);
				if (!productId) {
					unresolvedItems++;
					continue;
				}
				items.push({
					product: productId,
					quantity: item.quantity,
					addedAt: item.addedAt
						? new Date(item.addedAt).toISOString()
						: undefined,
				});
			}
			if (unresolvedItems > 0) {
				log.warn(
					`Корзина ${legacyId}: ${unresolvedItems} позиций пропущено (товар не найден)`,
				);
			}

			const result = await upsertByLegacyId({
				ctx,
				collection: "carts",
				legacyId,
				data: { user: userId, items },
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(`Не удалось перенести корзину (${legacyId})`, {
					error:
						result.error instanceof Error
							? result.error.message
							: String(result.error),
				});
				continue;
			}

			stats[result.action]++;
		}

		return stats;
	},
});
