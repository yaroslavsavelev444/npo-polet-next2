// scripts/db-migrate/core/index.ts
export { hasChanges, stableStringify } from "./hash.ts";
export type { Logger } from "./logger.ts";
export { createLogger } from "./logger.ts";
export type { RunnerOptions, RunnerReport } from "./runner.ts";
export { runMigrations } from "./runner.ts";
export type {
	MigrationContext,
	MigrationModule,
	MigrationStats,
} from "./types.ts";
export { defineMigration, emptyStats } from "./types.ts";
export type { UpsertAction, UpsertResult } from "./upsert.ts";
export { resolveRef, resolveRefs, upsertByLegacyId } from "./upsert.ts";
