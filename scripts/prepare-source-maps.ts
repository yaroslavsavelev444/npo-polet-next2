import type { Dirent } from "node:fs";
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

// Карты кода серверных бандлов — в standalone-образ.
//
// Запускается в Dockerfile сразу после `next build`. Нужен журналу ошибок
// (src/services/observability/source-maps.ts): без карт кадры стека
// веб-процесса указывают внутрь `.next/server/chunks/*.js` и не говорят, где
// ошибка.
//
// 1. `output: "standalone"` собирает дерево по трассировке `require`, а
//    `.js.map` не требует никто — в standalone их нет ни одного. Скрипт их
//    копирует.
// 2. Основной объём карты — `sourcesContent`, то есть вшитый текст
//    исходников. Для сопоставления кадра он не нужен, а в контейнере это ещё
//    и исходный код приложения в читаемом виде. Скрипт его вырезает.
//
// Наружу карты не отдаются: они в `.next/server`, а по HTTP Next раздаёт
// только `.next/static`.
//
// Запуск: node --experimental-strip-types scripts/prepare-source-maps.ts

const SERVER_DIR = ".next/server";
const STANDALONE_DIR = ".next/standalone/.next/server";

type SourceMapPayload = {
	sourcesContent?: unknown;
	sections?: { map?: { sourcesContent?: unknown } }[];
};

function walk(dir: string, out: string[] = []): string[] {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}

	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.name.endsWith(".js.map")) out.push(full);
	}

	return out;
}

function strip(payload: SourceMapPayload): SourceMapPayload {
	payload.sourcesContent = undefined;
	for (const section of payload.sections ?? []) {
		if (section.map) section.map.sourcesContent = undefined;
	}
	return payload;
}

function main(): void {
	const maps = walk(SERVER_DIR);

	if (maps.length === 0) {
		// Не отказ: serverSourceMaps могли выключить намеренно (память сборки).
		process.stdout.write(
			"Карт кода не найдено — serverSourceMaps выключен. Пропускаю.\n",
		);
		return;
	}

	let before = 0;
	let after = 0;
	let copied = 0;

	for (const file of maps) {
		before += statSync(file).size;

		let payload: SourceMapPayload;
		try {
			payload = JSON.parse(readFileSync(file, "utf8")) as SourceMapPayload;
		} catch (error) {
			// Битая карта — потеря читаемости одного чанка, не повод ронять сборку.
			process.stderr.write(`Не разобрал ${file}: ${String(error)}\n`);
			continue;
		}

		const slim = JSON.stringify(strip(payload));
		after += Buffer.byteLength(slim);
		writeFileSync(file, slim);

		const target = join(STANDALONE_DIR, relative(SERVER_DIR, file));
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, slim);
		copied += 1;
	}

	const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
	process.stdout.write(
		`Карты кода: ${copied} файлов, ${mb(before)} МБ → ${mb(after)} МБ ` +
			"(вырезан sourcesContent), скопированы в standalone.\n",
	);
}

main();
