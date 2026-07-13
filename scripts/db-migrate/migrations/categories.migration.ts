// scripts/db-migrate/migrations/categories.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyCategory {
	_id: ObjectId;
	name: string;
	slug: string;
	subtitle?: string;
	description?: string;
	order?: number;
	isActive?: boolean;
	metaTitle?: string;
	metaDescription?: string;
	keywords?: string[];
}

export default defineMigration({
	slug: "categories",
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyCategory>(LEGACY_COLLECTIONS.categories)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			// Новая схема требует description (в старой оно опциональное) —
			// подставляем название категории как разумный fallback, чтобы не
			// ронять запись целиком из-за отсутствующего текста.
			const description = old.description?.trim() || old.name;
			if (!old.description?.trim()) {
				log.warn(
					`У категории "${old.name}" (${legacyId}) нет description — подставлено название`,
				);
			}

			const result = await upsertByLegacyId({
				ctx,
				collection: "categories",
				legacyId,
				data: {
					name: old.name,
					slug: old.slug,
					subtitle: old.subtitle,
					description,
					order: old.order ?? 0,
					isActive: old.isActive ?? true,
					metaTitle: old.metaTitle,
					metaDescription: old.metaDescription,
					keywords: (old.keywords ?? []).map((keyword) => ({ keyword })),
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(
					`Не удалось перенести категорию "${old.name}" (${legacyId})`,
					{
						error:
							result.error instanceof Error
								? result.error.message
								: String(result.error),
					},
				);
				continue;
			}

			stats[result.action]++;
		}

		return stats;
	},
});
