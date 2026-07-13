// scripts/db-migrate/migrations/userConsents.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	resolveRef,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyUserAcceptedConsent {
	_id: ObjectId;
	userId: ObjectId;
	consentSlug: string;
	consentVersion: string;
	acceptedAt?: Date;
	ip: string;
	userAgent: string;
}

export default defineMigration({
	slug: "userConsents",
	dependsOn: ["users", "consents"],
	async run(ctx) {
		const { legacyDb, log, payload } = ctx;
		const stats = emptyStats();

		// consent резолвится не по legacyId (в старой записи его нет — только
		// slug), а напрямую по slug новой коллекции consents.
		const consentIdBySlug = new Map<string, string | number>();
		{
			let page = 1;
			for (;;) {
				const { docs, hasNextPage } = await payload.find({
					collection: "consents",
					limit: 1000,
					page,
					depth: 0,
					overrideAccess: true,
					select: { slug: true },
				});
				for (const doc of docs as Array<{
					id: string | number;
					slug: string;
				}>) {
					consentIdBySlug.set(doc.slug, doc.id);
				}
				if (!hasNextPage) break;
				page++;
			}
		}

		const cursor = legacyDb
			.collection<LegacyUserAcceptedConsent>(
				LEGACY_COLLECTIONS.userAcceptedConsents,
			)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const userId = await resolveRef(ctx, "users", old.userId?.toString());
			if (!userId) {
				stats.skipped++;
				log.warn(
					`Согласие пользователя (${legacyId}, slug=${old.consentSlug}): пользователь не найден, пропуск`,
				);
				continue;
			}

			const consentId = consentIdBySlug.get(old.consentSlug);
			if (!consentId) {
				stats.skipped++;
				log.warn(
					`Согласие пользователя (${legacyId}): документ согласия со slug="${old.consentSlug}" не найден в новой БД, пропуск`,
				);
				continue;
			}

			const result = await upsertByLegacyId({
				ctx,
				collection: "user-consents",
				legacyId,
				data: {
					user: userId,
					consent: consentId,
					consentSlug: old.consentSlug,
					version: old.consentVersion,
					acceptedAt: old.acceptedAt
						? new Date(old.acceptedAt).toISOString()
						: undefined,
					ip: old.ip,
					userAgent: old.userAgent,
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(`Не удалось перенести согласие пользователя (${legacyId})`, {
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
