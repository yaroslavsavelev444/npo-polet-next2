// scripts/db-migrate/core/runner.ts
import type { Db } from "mongodb";
import type { Payload } from "payload";
import { createLogger } from "./logger.ts";
import {
	emptyStats,
	type MigrationContext,
	type MigrationModule,
	type MigrationStats,
} from "./types.ts";

export interface RunnerOptions {
	payload: Payload;
	legacyDb: Db;
	dryRun: boolean;
	verbose: boolean;
	/** Если задано — выполняются только эти slug'и (плюс их зависимости, если те ещё не выполнены). */
	only?: string[];
}

function topologicalSort(modules: MigrationModule[]): MigrationModule[] {
	const bySlug = new Map(modules.map((m) => [m.slug, m]));
	const sorted: MigrationModule[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>();

	function visit(mod: MigrationModule) {
		if (visited.has(mod.slug)) return;
		if (visiting.has(mod.slug)) {
			throw new Error(
				`Циклическая зависимость миграций обнаружена вокруг "${mod.slug}"`,
			);
		}
		visiting.add(mod.slug);
		for (const depSlug of mod.dependsOn ?? []) {
			const dep = bySlug.get(depSlug);
			if (!dep) {
				throw new Error(
					`Миграция "${mod.slug}" зависит от "${depSlug}", но такая миграция не зарегистрирована`,
				);
			}
			visit(dep);
		}
		visiting.delete(mod.slug);
		visited.add(mod.slug);
		sorted.push(mod);
	}

	for (const mod of modules) visit(mod);
	return sorted;
}

/** slug'и, необходимые для выполнения указанных --only, с учётом transitive-зависимостей. */
function expandWithDependencies(
	modules: MigrationModule[],
	onlySlugs: string[],
): Set<string> {
	const bySlug = new Map(modules.map((m) => [m.slug, m]));
	const result = new Set<string>();

	function add(slug: string) {
		if (result.has(slug)) return;
		const mod = bySlug.get(slug);
		if (!mod) {
			throw new Error(`Неизвестная миграция в --only: "${slug}"`);
		}
		result.add(slug);
		for (const dep of mod.dependsOn ?? []) add(dep);
	}

	for (const slug of onlySlugs) add(slug);
	return result;
}

export interface RunnerReport {
	perMigration: Array<{
		slug: string;
		stats: MigrationStats;
		durationMs: number;
		error?: unknown;
	}>;
	totalDurationMs: number;
	hadFailures: boolean;
}

export async function runMigrations(
	modules: MigrationModule[],
	options: RunnerOptions,
): Promise<RunnerReport> {
	const rootLog = createLogger(options.verbose);
	const ordered = topologicalSort(modules);
	const runSet = options.only
		? expandWithDependencies(modules, options.only)
		: null;

	const idMapCache = new Map<string, Promise<Map<string, string | number>>>();

	const buildIdMap = async (
		collection: string,
	): Promise<Map<string, string | number>> => {
		const map = new Map<string, string | number>();
		let page = 1;
		const limit = 1000;
		// legacyId не задан у документов, созданных вручную в новой админке —
		// такие мы не индексируем (они не участвуют в резолве legacy-ссылок).
		for (;;) {
			const { docs, hasNextPage } = await options.payload.find({
				collection: collection as Parameters<Payload["find"]>[0]["collection"],
				where: { legacyId: { exists: true } },
				limit,
				page,
				depth: 0,
				overrideAccess: true,
				select: { legacyId: true },
			});
			for (const doc of docs as Array<{
				id: string | number;
				legacyId?: string;
			}>) {
				if (doc.legacyId) map.set(doc.legacyId, doc.id);
			}
			if (!hasNextPage) break;
			page++;
		}
		return map;
	};

	const getIdMap = (collection: string) => {
		let cached = idMapCache.get(collection);
		if (!cached) {
			cached = buildIdMap(collection);
			idMapCache.set(collection, cached);
		}
		return cached;
	};

	const report: RunnerReport = {
		perMigration: [],
		totalDurationMs: 0,
		hadFailures: false,
	};

	const overallStart = Date.now();

	for (const mod of ordered) {
		if (runSet && !runSet.has(mod.slug)) continue;

		const log = rootLog.child(mod.slug);
		const ctx: MigrationContext = {
			payload: options.payload,
			legacyDb: options.legacyDb,
			log,
			dryRun: options.dryRun,
			verbose: options.verbose,
			getIdMap,
		};

		log.info(`Старт${options.dryRun ? " (dry-run)" : ""}...`);
		const start = Date.now();
		try {
			const stats = await mod.run(ctx);
			const durationMs = Date.now() - start;
			report.perMigration.push({ slug: mod.slug, stats, durationMs });
			// Инвалидируем закэшированную карту id для этой коллекции — после
			// прогона в ней могли появиться новые записи, а последующие миграции
			// в этом же запуске (в т.ч. через --only с зависимостями) должны
			// видеть их.
			idMapCache.delete(mod.slug);
			log.info(
				`Готово за ${durationMs}мс: создано ${stats.created}, обновлено ${stats.updated}, без изменений ${stats.unchanged}, пропущено ${stats.skipped}, ошибок ${stats.failed}`,
			);
			if (stats.failed > 0) report.hadFailures = true;
		} catch (error) {
			const durationMs = Date.now() - start;
			report.perMigration.push({
				slug: mod.slug,
				stats: emptyStats(),
				durationMs,
				error,
			});
			report.hadFailures = true;
			log.error("Миграция прервана необработанной ошибкой", {
				error: error instanceof Error ? error.message : String(error),
			});
			// Не продолжаем с зависимыми миграциями, если родительская упала
			// целиком (а не отдельными записями) — иначе они будут работать по
			// заведомо неполным данным.
			break;
		}
	}

	report.totalDurationMs = Date.now() - overallStart;
	return report;
}
