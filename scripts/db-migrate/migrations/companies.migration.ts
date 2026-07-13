// scripts/db-migrate/migrations/companies.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	resolveRef,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyCompany {
	_id: ObjectId;
	user: ObjectId;
	companyName: string;
	legalAddress: string;
	companyAddress?: string;
	taxNumber: string;
	contactPerson?: string;
	phone?: string;
	email?: string;
}

export default defineMigration({
	slug: "companies",
	dependsOn: ["users"],
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyCompany>(LEGACY_COLLECTIONS.companies)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const userId = await resolveRef(ctx, "users", old.user?.toString());
			if (!userId) {
				stats.skipped++;
				log.warn(
					`Компания "${old.companyName}" (${legacyId}): пользователь-владелец не найден (возможно, был персоналом), пропуск`,
				);
				continue;
			}

			const result = await upsertByLegacyId({
				ctx,
				collection: "companies",
				legacyId,
				data: {
					user: userId,
					companyName: old.companyName,
					legalAddress: old.legalAddress,
					companyAddress: old.companyAddress,
					taxNumber: old.taxNumber?.replace(/\s/g, ""),
					contactPerson: old.contactPerson,
					phone: old.phone,
					email: old.email,
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(
					`Не удалось перенести компанию "${old.companyName}" (${legacyId})`,
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
