#!/usr/bin/env node
// scripts/db-migrate/run.ts
//
// Централизованная точка входа для всех миграций из старой MongoDB.
// Запуск: pnpm migrate:legacy [--dry-run] [--only=users,products] [--verbose]
// См. scripts/db-migrate/README.md за подробностями (сетевой доступ к
// старой Mongo, безопасность повторного запуска, интерпретация отчёта).
import "dotenv/config";
import type { Db } from "mongodb";
import { getPayload } from "payload";
import config from "../../payload.config.ts";
import { runMigrations } from "./core/index.ts";
import { LEGACY_COLLECTIONS } from "./lib/legacyCollections.ts";
import { closeLegacyMongo, getLegacyDb } from "./lib/legacyMongo.ts";
import { allMigrations } from "./migrations/index.ts";

interface CliOptions {
	dryRun: boolean;
	verbose: boolean;
	help: boolean;
	only?: string[];
}

function parseArgs(argv: string[]): CliOptions {
	const only = argv.find((a) => a.startsWith("--only="));
	return {
		dryRun: argv.includes("--dry-run"),
		verbose: argv.includes("--verbose"),
		help: argv.includes("--help") || argv.includes("-h"),
		only: only
			? only
					.slice("--only=".length)
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			: undefined,
	};
}

function printHelp() {
	console.log(`
Миграция данных из старой MongoDB в новую Payload/Postgres схему.

Использование:
  pnpm migrate:legacy [флаги]

Флаги:
  --dry-run          Ничего не пишет в новую БД — только считает, что было бы
                      создано/обновлено. Безопасно гонять сколько угодно раз.
  --only=a,b,c        Выполнить только указанные миграции (по slug) + их
                      зависимости (см. dependsOn в каждом *.migration.ts).
                      Доступные slug'и: ${allMigrations.map((m) => m.slug).join(", ")}
  --verbose           Подробный DEBUG-лог.
  --help, -h          Эта справка.

Переменные окружения:
  LEGACY_MONGODB_URI  Обязательна. Строка подключения к старой MongoDB,
                      см. scripts/db-migrate/README.md.
  Остальные — стандартные для проекта (DATABASE_URI, PAYLOAD_SECRET и т.д.,
  из .env/.env.production) — нужны, чтобы поднять Payload Local API.

Идемпотентность:
  Каждая запись сопоставляется со старой по полю legacyId. Повторный запуск
  без --only обрабатывает ВСЕ записи каждой сущности заново: уже
  перенесённые и не изменившиеся с прошлого раза пропускаются (unchanged),
  изменившиеся — обновляются, новые — создаются. Удалённые в старой базе
  записи в новой базе не трогаются (см. README).
`);
}

function printReport(report: Awaited<ReturnType<typeof runMigrations>>) {
	console.log("\n=== Итог миграции ===");
	console.table(
		report.perMigration.map((m) => ({
			migration: m.slug,
			created: m.stats.created,
			updated: m.stats.updated,
			unchanged: m.stats.unchanged,
			skipped: m.stats.skipped,
			failed: m.stats.failed,
			ms: m.durationMs,
			crashed: m.error ? "ДА" : "",
		})),
	);
	console.log(`Всего: ${report.totalDurationMs}мс`);
	if (report.hadFailures) {
		console.error(
			"\n❌ Были ошибки на уровне отдельных записей или миграция прервана — см. ERROR/WARN выше по логу.",
		);
	} else {
		console.log("\n✅ Без ошибок.");
	}
}

/**
 * Сверяет имена коллекций из LEGACY_COLLECTIONS с тем, что реально есть в
 * старой Mongo, и падает с понятным сообщением, если чего-то нет.
 *
 * Без этой проверки опечатка в имени (или другая плюрализация mongoose в
 * старом проекте) выглядит как полностью успешный прогон: Mongo молча отдаёт
 * пустой курсор по несуществующей коллекции, миграция обрабатывает 0
 * документов и печатает «✅ Без ошибок». Именно такое поведение легко принять
 * за «всё уже перенесено».
 *
 * README обещал эту проверку с самого начала, но в коде её не было.
 */
async function assertLegacyCollectionsExist(legacyDb: Db): Promise<void> {
	const existing = new Set(
		(await legacyDb.listCollections({}, { nameOnly: true }).toArray()).map(
			(c) => c.name,
		),
	);

	const missing = Object.entries(LEGACY_COLLECTIONS)
		.filter(([, name]) => !existing.has(name))
		.map(([key, name]) => `${name} (для миграции ${key})`);

	if (missing.length > 0) {
		throw new Error(
			`В старой БД "${legacyDb.databaseName}" нет ожидаемых коллекций:\n` +
				missing.map((m) => `  - ${m}`).join("\n") +
				"\n\nПроверьте LEGACY_MONGODB_URI (та ли база?) и имена в " +
				"scripts/db-migrate/lib/legacyCollections.ts.\n" +
				`Фактически в базе есть: ${[...existing].sort().join(", ") || "(пусто)"}`,
		);
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printHelp();
		return;
	}

	console.log("=== Миграция из старой MongoDB ===");
	if (options.dryRun)
		console.log("Режим: DRY-RUN (изменения в новую БД не пишутся)");
	if (options.only) console.log(`Только: ${options.only.join(", ")}`);

	const legacyDb = await getLegacyDb();
	await assertLegacyCollectionsExist(legacyDb);
	const payload = await getPayload({ config });

	const report = await runMigrations(allMigrations, {
		payload,
		legacyDb,
		dryRun: options.dryRun,
		verbose: options.verbose,
		only: options.only,
	});

	printReport(report);
	await closeLegacyMongo();
	process.exit(report.hadFailures ? 1 : 0);
}

main().catch((err) => {
	console.error("💥 Миграция аварийно прервана:", err);
	process.exit(1);
});
