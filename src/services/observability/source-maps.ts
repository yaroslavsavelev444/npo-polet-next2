import { existsSync, readFileSync, statSync } from "node:fs";
import { SourceMap } from "node:module";
import { dirname, resolve } from "node:path";

// Сопоставление кадра стека собранного бандла с исходником.
//
// Воркеры идут по исходникам, и их стеки читаемы сами по себе. Веб-процесс
// собран Next, и его кадры выглядят как `at f (/app/.next/server/chunks/
// 4721.js:1:28934)` — то есть не отвечают на вопрос, ради которого стек
// читают.
//
// Флага `experimental.serverSourceMaps` для этого мало: Next подменяет
// `Error.prepareStackTrace` своей реализацией, собирающей строку из СЫРЫХ
// кадров, и применяет карты только при `util.inspect`, а мы читаем `.stack`.
// По той же причине не помогает и `--enable-source-maps`. Поэтому
// сопоставляем сами, через `SourceMap` из `node:module`: он понимает и
// секционный формат Turbopack, и не зависит от того, что Next сделал с Error.
//
// Карты в образ кладёт `scripts/prepare-source-maps.ts`: трассировка
// `output: "standalone"` их не переносит — `.js.map` никто не `require`.

/**
 * Карт в памяти. Ошибки кучкуются в нескольких чанках, а промах кэша стоит
 * одного чтения файла — держать в процессе все карты незачем.
 */
const CACHE_LIMIT = 20;

/** Карту больше этого не читаем: разбор дороже пользы от одного кадра. */
const MAX_MAP_BYTES = 32 * 1024 * 1024;

const TAIL_BYTES = 512;

const cache = new Map<string, SourceMap | null>();

function remember(file: string, map: SourceMap | null): SourceMap | null {
	if (cache.size >= CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}

	cache.set(file, map);
	return map;
}

/**
 * Файл карты для бандла: соседний `.js.map` или то, на что указывает
 * `sourceMappingURL`.
 *
 * ⚠ `turbopackIgnore` на каждом обращении к диску обязателен. Пути здесь
 * приходят из кадров стека во время выполнения, и Turbopack, увидев такое
 * обращение, трассирует в серверный вывод весь проект вместе с `public/`.
 */
function locateMapFile(jsFile: string): string | null {
	const sibling = `${jsFile}.map`;
	if (existsSync(/*turbopackIgnore: true*/ sibling)) return sibling;

	try {
		const size = statSync(/*turbopackIgnore: true*/ jsFile).size;
		const tail = readFileSync(/*turbopackIgnore: true*/ jsFile)
			.subarray(Math.max(0, size - TAIL_BYTES))
			.toString("utf8");

		const match = /[#@]\s*sourceMappingURL=(\S+)/.exec(tail);
		if (!match?.[1] || match[1].startsWith("data:")) return null;

		const candidate = resolve(dirname(jsFile), match[1]);
		return existsSync(/*turbopackIgnore: true*/ candidate) ? candidate : null;
	} catch {
		return null;
	}
}

function loadMap(jsFile: string): SourceMap | null {
	if (cache.has(jsFile)) return cache.get(jsFile) ?? null;

	try {
		const mapFile = locateMapFile(jsFile);
		if (!mapFile) return remember(jsFile, null);

		if (statSync(/*turbopackIgnore: true*/ mapFile).size > MAX_MAP_BYTES) {
			return remember(jsFile, null);
		}

		const payload = JSON.parse(
			readFileSync(/*turbopackIgnore: true*/ mapFile, "utf8"),
		);
		return remember(jsFile, new SourceMap(payload));
	} catch {
		// Битая карта ничего не ломает: кадр останется как пришёл. Отрицательный
		// результат тоже запоминается, иначе каждый повтор ошибки заново читал
		// бы тот же отсутствующий файл.
		return remember(jsFile, null);
	}
}

export type MappedFrame = { file: string; line: number; column: number };

type ResolvedMapping = {
	originalSource: string;
	originalLine: number;
	originalColumn: number;
};

function isMapping(entry: unknown): entry is ResolvedMapping {
	if (typeof entry !== "object" || entry === null) return false;

	const candidate = entry as Partial<ResolvedMapping>;

	return (
		typeof candidate.originalSource === "string" &&
		typeof candidate.originalLine === "number" &&
		typeof candidate.originalColumn === "number"
	);
}

/**
 * Сопоставить кадр с исходником; `null` — карты нет или позиция в ней не
 * найдена. В стеке координаты с единицы, в карте — с нуля.
 */
export function mapFrame(
	file: string,
	line: number | undefined,
	column: number | undefined,
): MappedFrame | null {
	// Карты есть только у собранного кода. Проверка экономит обращение к
	// диску на каждом кадре `node:` и `node_modules`.
	if (!line || !file.includes(".next/")) return null;

	const map = loadMap(file);
	if (!map) return null;

	try {
		const entry = map.findEntry(line - 1, (column ?? 1) - 1);
		if (!isMapping(entry)) return null;

		return {
			file: entry.originalSource,
			line: entry.originalLine + 1,
			column: entry.originalColumn + 1,
		};
	} catch {
		return null;
	}
}
