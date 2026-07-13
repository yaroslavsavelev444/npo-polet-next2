// scripts/db-migrate/migrations/consents.migration.ts

import { createHash } from "node:crypto";
import type { ObjectId } from "mongodb";
import {
	defineMigration,
	emptyStats,
	upsertByLegacyId,
} from "../core/index.ts";
import { LEGACY_COLLECTIONS } from "../lib/legacyCollections.ts";

interface LegacyVersionHistory {
	version: string;
	content: string;
	documentUrl?: string;
	changeDescription?: string;
	createdAt?: Date;
}

interface LegacyConsent {
	_id: ObjectId;
	title: string;
	slug: string;
	description?: string;
	content: string;
	documentUrl?: string;
	isRequired?: boolean;
	needsAcceptance?: boolean;
	isActive?: boolean;
	version?: string;
	history?: LegacyVersionHistory[];
	lastUpdatedAt?: Date;
}

// lastUpdatedBy в старой системе почти всегда staff (редактирование
// юридических документов) — персонал не мигрируется (см. users.migration),
// поэтому это поле сознательно не резолвится и не переносится.
//
// Новая коллекция Consents на update с изменившимся content/documentUrl
// сама пересчитывает version/checksum/history через versioningHook (см.
// src/payload/collections/Consents.ts) — при повторном прогоне миграции на
// действительно изменившемся документе итоговый version может отличаться
// от version в старой системе (хук просто инкрементирует patch), это
// ожидаемо и не является потерей данных: содержимое (content) остаётся
// синхронизированным, что и является целью повторных прогонов.
export default defineMigration({
	slug: "consents",
	async run(ctx) {
		const { legacyDb, log } = ctx;
		const stats = emptyStats();

		const cursor = legacyDb
			.collection<LegacyConsent>(LEGACY_COLLECTIONS.consents)
			.find({});

		for await (const old of cursor) {
			const legacyId = old._id.toString();

			const result = await upsertByLegacyId({
				ctx,
				collection: "consents",
				legacyId,
				data: {
					title: old.title,
					slug: old.slug,
					description: old.description,
					content: old.content,
					documentUrl: old.documentUrl,
					isRequired: old.isRequired ?? true,
					needsAcceptance: old.needsAcceptance ?? true,
					isActive: old.isActive ?? true,
					version: old.version ?? "1.0.0",
					checksum: createHash("sha256")
						.update(old.content ?? "")
						.digest("hex"),
					lastUpdatedAt: old.lastUpdatedAt
						? new Date(old.lastUpdatedAt).toISOString()
						: undefined,
					history: (old.history ?? []).map((h) => ({
						version: h.version,
						content: h.content,
						documentUrl: h.documentUrl,
						changeDescription: h.changeDescription,
						createdAt: h.createdAt
							? new Date(h.createdAt).toISOString()
							: undefined,
					})),
				},
			});

			if (result.action === "failed") {
				stats.failed++;
				log.error(
					`Не удалось перенести согласие "${old.title}" (${legacyId})`,
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
