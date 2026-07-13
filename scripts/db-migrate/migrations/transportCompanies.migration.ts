// scripts/db-migrate/migrations/transportCompanies.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyTransportCompany {
	_id: ObjectId;
	name: string;
	isActive?: boolean;
}

export default defineMigration({
	slug: "transportCompanies",
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyTransportCompany>(LEGACY_COLLECTIONS.transportCompanies)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const result = await upsertByLegacyId({
				ctx,
				collection: "transport-companies",
				legacyId,
				data: {
					name: old.name,
					isActive: old.isActive ?? true,
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(
					`Не удалось перенести транспортную компанию "${old.name}" (${legacyId})`,
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
