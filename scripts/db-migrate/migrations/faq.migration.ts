// scripts/db-migrate/migrations/faq.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyFaqQuestion {
	question: string;
	answer: string;
	order?: number;
	isActive?: boolean;
}

interface LegacyFaqTopic {
	_id: ObjectId;
	title: string;
	description?: string;
	questions?: LegacyFaqQuestion[];
	order?: number;
	isActive?: boolean;
}

export default defineMigration({
	slug: "faq",
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyFaqTopic>(LEGACY_COLLECTIONS.faqTopics)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const result = await upsertByLegacyId({
				ctx,
				collection: "faq",
				legacyId,
				data: {
					title: old.title,
					description: old.description,
					order: old.order ?? 0,
					isActive: old.isActive ?? true,
					questions: (old.questions ?? []).map((q) => ({
						question: q.question,
						answer: q.answer,
						order: q.order ?? 0,
						isActive: q.isActive ?? true,
					})),
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(
					`Не удалось перенести FAQ-тему "${old.title}" (${legacyId})`,
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
