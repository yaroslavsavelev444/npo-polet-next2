/**
 * Обёртка над CLI Payload: generate:types, generate:importmap, migrate:*.
 *
 * Штатный бинарник `payload` грузит payload.config.ts через CJS-транспайлер
 * tsx, а @payloadcms/richtext-lexical — ESM-модуль с top-level await. Node
 * такое require() запрещает (ERR_REQUIRE_ASYNC_MODULE), и любая команда
 * падала сразу после подключения lexical-редактора. Этот скрипт делает то же
 * самое, но подключает конфиг настоящим `import()` — то есть ESM-графом, где
 * top-level await легален.
 *
 * Запускается через node --experimental-strip-types, а НЕ через tsx: tsx
 * подменяет загрузку CJS-модулей и ломает интероп @next/env внутри
 * payload/bin/loadEnv.js. Штатное срезание типов в Node грузит всё как
 * настоящий ESM, и обе проблемы исчезают.
 *
 * Запуск: см. скрипты payload:* в package.json.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import type { SanitizedConfig } from "payload";

// generateTypes, generateImportMap и migrate не перечислены в "exports" пакета
// payload (а баррель payload/node тянет за собой @next/env и падает под tsx),
// поэтому подключаем их по фактическому пути внутри пакета. createRequire
// нужен, чтобы разрешить путь через pnpm-симлинк node_modules/payload.
const requireFromHere = createRequire(import.meta.url);
const payloadDist = requireFromHere
	.resolve("payload")
	.replace(/index\.js$/, "");

// Каждая команда подтягивает только свой модуль: bin/migrate.js и
// bin/generateImportMap тянут за собой bin/loadEnv.js, который под tsx падает
// на CJS-интеропе с @next/env — а команде generate:types он не нужен вовсе.
const load = <T,>(path: string) =>
	import(`${payloadDist}${path}`) as Promise<T>;

async function loadConfig(): Promise<SanitizedConfig> {
	const { default: rawConfig } = await import("../payload.config.ts");
	return (await rawConfig) as SanitizedConfig;
}

/**
 * Минимальный разбор аргументов в формате minimist (`{ _: [...], flag: value }`),
 * который ожидает payload/bin/migrate. Полноценный minimist сюда не тянем: он
 * не является прямой зависимостью проекта, а нужен ровно этот подмножество.
 */
function parseArgs(argv: string[]) {
	const parsed: { _: string[]; [key: string]: unknown } = { _: [] };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("--")) {
			parsed._.push(arg);
			continue;
		}
		const [rawKey, inlineValue] = arg.slice(2).split("=");
		if (inlineValue !== undefined) {
			parsed[rawKey] = inlineValue;
			continue;
		}
		const next = argv[i + 1];
		if (next && !next.startsWith("--")) {
			parsed[rawKey] = next;
			i++;
		} else {
			parsed[rawKey] = true;
		}
	}

	return parsed;
}

async function main() {
	const parsedArgs = parseArgs(process.argv.slice(2));
	const command = parsedArgs._[0];

	if (!command) {
		console.error(
			"Укажите команду: generate:types | generate:importmap | migrate | migrate:create | migrate:status | migrate:down",
		);
		process.exit(1);
	}

	const config = await loadConfig();

	switch (command) {
		case "generate:types": {
			const { generateTypes } = await load<{
				generateTypes: (
					config: SanitizedConfig,
					options?: { log: boolean },
				) => Promise<void>;
			}>("bin/generateTypes.js");
			await generateTypes(config, { log: true });
			break;
		}

		case "generate:importmap": {
			const { generateImportMap } = await load<{
				generateImportMap: (
					config: SanitizedConfig,
					options?: { force?: boolean; log: boolean },
				) => Promise<void>;
			}>("bin/generateImportMap/index.js");
			await generateImportMap(config, { log: true, force: true });
			break;
		}

		default: {
			if (!command.startsWith("migrate")) {
				console.error(`Неизвестная команда: ${command}`);
				process.exit(1);
			}
			const { migrate } = await load<{
				migrate: (args: {
					config: SanitizedConfig;
					parsedArgs: { _: string[]; [key: string]: unknown };
				}) => Promise<void>;
			}>("bin/migrate.js");
			await migrate({ config, parsedArgs });
			break;
		}
	}

	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
