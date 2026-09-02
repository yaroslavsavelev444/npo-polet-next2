import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Каждая коллекция Payload обязана ЯВНО объявлять все четыре операции
 * доступа.
 *
 * Почему это проверяется автоматически: неуказанную операцию Payload
 * заполняет своим дефолтом `({ req }) => Boolean(req.user)` (см.
 * node_modules/payload/dist/auth/defaultAccess.js и
 * addDefaultsToCollectionConfig в collections/config/defaults.js). В этом
 * проекте `req.user` — это в том числе обычный покупатель из коллекции
 * `users`, поэтому коллекция, где объявлен только `read`, оказывается
 * открытой на запись любому зарегистрированному пользователю через
 * POST/PATCH/DELETE /api/<slug>. Именно так были открыты knowledge-topics,
 * pickup-points и transport-companies: контент публичных страниц и
 * справочники доставки правились и удалялись из обычного аккаунта.
 *
 * Проверка нарочно статическая (по исходникам, без загрузки payload.config):
 * она должна выполняться за миллисекунды и не требовать ни БД, ни окружения.
 *
 * Запуск: pnpm test:security
 */

const REQUIRED_OPERATIONS = ["read", "create", "update", "delete"] as const;

const collectionsDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../src/payload/collections",
);

function collectionFiles(): string[] {
	return readdirSync(collectionsDir)
		.filter((name) => name.endsWith(".ts"))
		.map((name) => path.join(collectionsDir, name));
}

/** Тело литерала `access: { ... }` верхнего уровня коллекции. */
function extractAccessBlock(source: string): string | null {
	const start = source.search(/^\s*access:\s*\{/m);
	if (start === -1) return null;

	const open = source.indexOf("{", start);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return null;
}

test("каждая коллекция объявляет read/create/update/delete явно", () => {
	const files = collectionFiles();
	assert.ok(files.length > 0, "коллекции не найдены — проверьте путь");

	const problems: string[] = [];

	for (const file of files) {
		const source = readFileSync(file, "utf8");
		const access = extractAccessBlock(source);

		if (access === null) {
			problems.push(`${path.basename(file)}: нет блока access`);
			continue;
		}

		for (const operation of REQUIRED_OPERATIONS) {
			const declared = new RegExp(`(^|\\n)\\s*${operation}\\s*:`).test(access);
			if (!declared) {
				problems.push(
					`${path.basename(file)}: не объявлена операция "${operation}" — ` +
						"Payload подставит дефолт «любой авторизованный пользователь»",
				);
			}
		}
	}

	assert.deepEqual(problems, []);
});
