// scripts/db-migrate/migrations/pickupPoints.migration.ts
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyPickupPoint {
	_id: ObjectId;
	name: string;
	address?: {
		street?: string;
		city?: string;
		postalCode?: string;
		country?: string;
	};
	coordinates?: { lat?: number; lng?: number };
	workingHours?: string;
	contact?: { phone?: string; email?: string };
	isActive?: boolean;
}

// Старая модель хранила address структурой {street, city, postalCode,
// country}, contact.email, description, isMain, orderIndex — новая схема
// pickup-points заметно уже: один текстовый address + city + phone +
// workingHours + coordinates + isActive. contact.email/description/isMain/
// orderIndex/country намеренно не переносятся — под них нет полей.
export default defineMigration({
	slug: "pickupPoints",
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyPickupPoint>(LEGACY_COLLECTIONS.pickupPoints)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const address =
				[old.address?.street, old.address?.postalCode]
					.filter(Boolean)
					.join(", ") ||
				old.address?.city ||
				old.name;

			const result = await upsertByLegacyId({
				ctx,
				collection: "pickup-points",
				legacyId,
				data: {
					name: old.name,
					address,
					city: old.address?.city,
					phone: old.contact?.phone,
					workingHours: old.workingHours,
					coordinates: {
						lat: old.coordinates?.lat,
						lng: old.coordinates?.lng,
					},
					isActive: old.isActive ?? true,
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(`Не удалось перенести ПВЗ "${old.name}" (${legacyId})`, {
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
