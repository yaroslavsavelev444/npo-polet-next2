// scripts/db-migrate/migrations/wishlists.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	resolveRef,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyWishlistItem {
	product: ObjectId;
	addedAt?: Date;
	notes?: string;
}

interface LegacyWishlist {
	_id: ObjectId;
	user: ObjectId;
	items?: LegacyWishlistItem[];
}

// settings{notifyOnPriceDrop,notifyOnRestock,sortBy} старой модели не имеет
// аналога в новой схеме wishlists — не переносится.
export default defineMigration({
	slug: "wishlists",
	dependsOn: ["users", "products"],
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyWishlist>(LEGACY_COLLECTIONS.wishlists)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const userId = await resolveRef(ctx, "users", old.user?.toString());
			if (!userId) {
				stats.skipped++;
				log.warn(`Избранное (${legacyId}): пользователь не найден, пропуск`);
				continue;
			}

			const items: Array<{
				product: string | number;
				addedAt?: string;
				notes?: string;
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
					addedAt: item.addedAt
						? new Date(item.addedAt).toISOString()
						: undefined,
					notes: item.notes,
				});
			}
			if (unresolvedItems > 0) {
				log.warn(
					`Избранное ${legacyId}: ${unresolvedItems} позиций пропущено (товар не найден)`,
				);
			}

			const result = await upsertByLegacyId({
				ctx,
				collection: "wishlists",
				legacyId,
				data: { user: userId, items, totalItems: items.length },
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(`Не удалось перенести избранное (${legacyId})`, {
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
