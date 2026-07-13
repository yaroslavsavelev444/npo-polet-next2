// scripts/db-migrate/migrations/discounts.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	resolveRefs,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyDiscount {
	_id: ObjectId;
	name: string;
	description?: string;
	type: "percentage" | "fixed" | "quantity_based";
	discountPercent: number;
	fixedAmount?: number;
	minTotalQuantity?: number;
	minTotalAmount?: number;
	appliesToAllProducts?: boolean;
	applicableCategories?: Array<ObjectId>;
	applicableProducts?: Array<ObjectId>;
	isActive?: boolean;
	isUnlimited?: boolean;
	startAt?: Date;
	endAt?: Date;
	priority?: number;
	code?: string;
	totalUses?: number;
	totalDiscountAmount?: number;
}

// createdBy/updatedBy в новой схеме указывают только на admins — персонал
// не мигрируется, поэтому эти поля намеренно не переносятся.
export default defineMigration({
	slug: "discounts",
	dependsOn: ["categories", "products"],
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyDiscount>(LEGACY_COLLECTIONS.discounts)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const {
				ids: applicableCategories,
				unresolvedCount: unresolvedCategories,
			} = await resolveRefs(ctx, "categories", old.applicableCategories);
			const { ids: applicableProducts, unresolvedCount: unresolvedProducts } =
				await resolveRefs(ctx, "products", old.applicableProducts);

			if (unresolvedCategories > 0 || unresolvedProducts > 0) {
				log.warn(
					`Скидка "${old.name}" (${legacyId}): не найдено категорий ${unresolvedCategories}, товаров ${unresolvedProducts}`,
				);
			}

			const result = await upsertByLegacyId({
				ctx,
				collection: "discounts",
				legacyId,
				data: {
					name: old.name,
					description: old.description,
					type: old.type,
					discountPercent: old.discountPercent,
					fixedAmount: old.fixedAmount,
					minTotalQuantity: old.minTotalQuantity,
					minTotalAmount: old.minTotalAmount,
					appliesToAllProducts: old.appliesToAllProducts ?? true,
					applicableCategories,
					applicableProducts,
					isActive: old.isActive ?? true,
					isUnlimited: old.isUnlimited ?? false,
					startAt: old.startAt
						? new Date(old.startAt).toISOString()
						: new Date().toISOString(),
					endAt: old.endAt ? new Date(old.endAt).toISOString() : undefined,
					priority: old.priority ?? 1,
					code: old.code,
					totalUses: old.totalUses ?? 0,
					totalDiscountAmount: old.totalDiscountAmount ?? 0,
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(`Не удалось перенести скидку "${old.name}" (${legacyId})`, {
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
