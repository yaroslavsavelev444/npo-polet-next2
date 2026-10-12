/**
 * SQL-разница между конфигурацией Payload и живой базой — без применения.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/schema-diff.mts
 *
 * Миграции в проекте пишутся руками (снимок схемы в src/migrations/*.json
 * устарел, `migrate:create` бесполезен). Самое хрупкое в ручной миграции —
 * имена: таблиц, колонок, enum, индексов, внешних ключей. Payload выводит их
 * из конфигурации сам, и колонку с «почти тем же» именем он просто не найдёт.
 *
 * Скрипт спрашивает у drizzle-kit ровно то, что сделал бы dev-push
 * (`pushSchema`), но НЕ применяет его, а печатает операторы. Сверка
 * ручной миграции: накатить её на локальную базу и убедиться, что вывод
 * пустой (или содержит только известный посторонний дрейф).
 *
 * ⚠ pushSchema может задать интерактивный вопрос о переименовании, если в
 * базе и конфигурации есть одновременно «лишняя» и «недостающая» колонка в
 * одной таблице. Тогда скрипт ждёт ввода — это и есть сигнал расхождения.
 */
import "dotenv/config";
import type { SanitizedConfig } from "payload";
import { getPayload } from "payload";

const { default: rawConfig } = await import("../payload.config.ts");
const config = (await rawConfig) as SanitizedConfig;

const payload = await getPayload({ config });

// requireDrizzleKit адаптера — тот же путь, которым dev-push берёт drizzle-kit.
const adapter = payload.db as unknown as {
	schema: Record<string, unknown>;
	drizzle: unknown;
	requireDrizzleKit: () => {
		pushSchema: (
			schema: Record<string, unknown>,
			drizzle: unknown,
		) => Promise<{
			statementsToExecute: string[];
			warnings: string[];
			hasDataLoss: boolean;
		}>;
	};
};

const { statementsToExecute, warnings, hasDataLoss } = await adapter
	.requireDrizzleKit()
	.pushSchema(adapter.schema, adapter.drizzle);

if (warnings.length) {
	console.log(
		`-- ПРЕДУПРЕЖДЕНИЯ${hasDataLoss ? " (возможна потеря данных)" : ""}:`,
	);
	for (const warning of warnings) console.log(`--   ${warning}`);
}

if (statementsToExecute.length === 0) {
	console.log("-- Расхождений нет.");
} else {
	for (const statement of statementsToExecute) {
		const trimmed = statement.trim();
		console.log(trimmed.endsWith(";") ? trimmed : `${trimmed};`);
	}
}

process.exit(0);
