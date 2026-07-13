// scripts/db-migrate/core/types.ts
import type { Db } from "mongodb";
import type { Payload } from "payload";
import type { Logger } from "./logger.ts";

export interface MigrationStats {
	created: number;
	updated: number;
	unchanged: number;
	/** Запись сознательно пропущена (например, не найдена обязательная связь) */
	skipped: number;
	failed: number;
}

export function emptyStats(): MigrationStats {
	return { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
}

export interface MigrationContext {
	payload: Payload;
	legacyDb: Db;
	log: Logger;
	dryRun: boolean;
	verbose: boolean;
	/**
	 * Кэшированная карта legacyId -> новый id для указанной Payload-коллекции.
	 * Строится один раз за прогон (лениво, при первом обращении) полным
	 * сканированием новой коллекции — это на порядки быстрее, чем резолвить
	 * каждую ссылку отдельным запросом к БД, и именно поэтому миграции
	 * зависимых сущностей (Products зависит от Categories и т.д.) должны
	 * запускаться СТРОГО после того, как родительская сущность уже перенесена
	 * в этом же прогоне — иначе карта будет неполной.
	 */
	getIdMap(collection: string): Promise<Map<string, string | number>>;
}

export interface MigrationModule {
	/** Совпадает с именем в отчёте и с --only=<slug> */
	slug: string;
	/** slugs других миграций, которые обязаны выполниться раньше */
	dependsOn?: string[];
	run(ctx: MigrationContext): Promise<MigrationStats>;
}

export function defineMigration(module: MigrationModule): MigrationModule {
	return module;
}
