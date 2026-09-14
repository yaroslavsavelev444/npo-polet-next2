/**
 * Достройка расширений при импорте — для тестов, запускаемых голым Node.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ
 * ────────────────────────────────────────────────────────────────────────────
 * Код витрины написан под сборщик Next, а он достраивает расширения сам:
 * сервисы импортируют `../../env` и `next/cache`, а не `../../env.ts` и
 * `next/cache.js`. ESM-резолвер Node расширений не достраивает, и модуль,
 * написанный в этом стиле, под `node --test` падает с ERR_MODULE_NOT_FOUND
 * ещё до первого теста.
 *
 * Коллекции и payload.config расширения указывают (их грузит сам Payload), а
 * сервисы витрины — нет. Тест ходит и туда, и туда, поэтому разрешение
 * нужно общее.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ХУК, А НЕ ПРАВКА ИМПОРТОВ
 * ────────────────────────────────────────────────────────────────────────────
 * Расставить расширения в боевых сервисах значило бы подогнать код витрины
 * под способ запуска тестов и разойтись со стилем, в котором написан весь
 * остальной фронтенд. Достройка живёт в окружении теста и срабатывает ТОЛЬКО
 * после того, как штатное разрешение уже отказало, — то есть ничего
 * работающего собой не подменяет.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НЕ tsx
 * ────────────────────────────────────────────────────────────────────────────
 * tsx решил бы это своей CJS-совместимой загрузкой, но ломает интероп
 * @next/env внутри payload/bin/loadEnv.js — ровно та причина, по которой на
 * голый Node переведён и scripts/payload-cli.mts (см. его шапку).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * АЛИАС @/
 * ────────────────────────────────────────────────────────────────────────────
 * Тем же свойством обладает алиас `@/` → `./src/` из tsconfig: его понимает
 * сборщик, а Node — нет. Модули витрины пользуются им наравне с
 * относительными путями (весь modules/banners, например), поэтому без
 * разворачивания алиаса тест до них просто не доходит.
 *
 * Подключается флагом --import, см. скрипт test:reviews в package.json.
 */

import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

/** Корень проекта: файл лежит в tests/support/, то есть двумя уровнями ниже. */
const SRC = new URL("../../src/", import.meta.url);
const ROOT = new URL("../../", import.meta.url);

/** Пути из tsconfig, разрешаемые вручную. Порядок — от частного к общему. */
const ALIASES = [
	["@/payload-types", new URL("payload-types.ts", ROOT).href],
	["@/payloadconfig", new URL("payload.config.ts", ROOT).href],
];

const HAS_EXTENSION = /\.[cm]?[jt]s$|\.json$|\.node$/;

/** Порядок важен: у сервисов витрины сосед — .ts, у пакетов вроде next — .js. */
const CANDIDATES = [".ts", ".js", "/index.ts", "/index.js"];

function isResolvable(specifier) {
	return (
		specifier.startsWith(".") ||
		specifier.startsWith("/") ||
		specifier.startsWith("next/")
	);
}

registerHooks({
	resolve(specifier, context, nextResolve) {
		for (const [alias, target] of ALIASES) {
			if (specifier === alias) return nextResolve(target, context);
		}
		if (specifier.startsWith("@/")) {
			// Разворачиваем в абсолютный URL и отдаём в общий путь ниже: у
			// модулей витрины расширения тоже не проставлены.
			const expanded = new URL(specifier.slice(2), SRC).href;
			return resolveWithExtensions(expanded, context, nextResolve);
		}
		if (!isResolvable(specifier) || HAS_EXTENSION.test(specifier)) {
			return nextResolve(specifier, context);
		}

		return resolveWithExtensions(specifier, context, nextResolve);
	},
});

/** Штатное разрешение, а при неудаче — те же пути с дописанным расширением. */
function resolveWithExtensions(specifier, context, nextResolve) {
	try {
		return nextResolve(specifier, context);
	} catch (error) {
		if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;

		for (const suffix of CANDIDATES) {
			try {
				return nextResolve(`${specifier}${suffix}`, context);
			} catch (retryError) {
				if (retryError?.code !== "ERR_MODULE_NOT_FOUND") throw retryError;
			}
		}
		// Ни один вариант не подошёл — сообщаем исходную причину, а не
		// последнюю неудачную попытку: она указывает на настоящий импорт.
		throw error;
	}
}
