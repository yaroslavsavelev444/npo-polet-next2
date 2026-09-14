#!/usr/bin/env node
// Проверяет, что весь граф импортов, достижимый из payload.config.ts,
// пригоден для нативного Node ESM резолвера: относительные импорты
// с явным расширением, без алиасов @/*, без .tsx и без барелей
// фичемодулей (modules/*/index.ts) в качестве источника значений.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY = resolve(ROOT, "payload.config.ts");

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\bfrom\s*["']([^"']+)["']/g;

const visited = new Set();
const errors = [];

function readSpecifiers(filePath) {
  const source = readFileSync(filePath, "utf8");
  const specs = [];
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(source))) {
    specs.push(match[1]);
  }
  return specs;
}

function checkFile(filePath) {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  if (!existsSync(filePath)) {
    errors.push(`Файл не найден: ${filePath}`);
    return;
  }
  if (extname(filePath) === ".tsx") {
    errors.push(`React-компонент в серверном графе Payload: ${filePath}`);
    return; // дальше не идём — это уже нарушение
  }

  const specs = readSpecifiers(filePath);
  for (const spec of specs) {
    if (spec.startsWith("@/")) {
      errors.push(
        `Алиас "@/" недопустим в этом графе: ${spec} (в ${filePath})`,
      );
      continue;
    }
    // Подпуть пакета next обязан нести расширение .js.
    //
    // У next НЕТ поля "exports" в package.json, поэтому ESM-резолвер Node
    // ищет файл буквально: next/cache -> node_modules/next/cache, которого не
    // существует (есть только cache.js). Сборщик Next и require() из CJS
    // достраивают расширение сами, поэтому такой импорт незаметно работает в
    // приложении — и падает в контейнере миграций, который грузит
    // payload.config.ts нативным ESM:
    //   Cannot find module '.../node_modules/next/cache'
    //   Did you mean to import "next/cache.js"?
    // Проверка добавлена после того, как ровно это уронило выкладку: файл
    // сервиса попал в граф конфига вместе с новой фичей, а guard пропускал
    // любой неотносительный спецификатор.
    if (/^next\/.+/.test(spec) && !spec.endsWith(".js")) {
      errors.push(
        `Подпуть next без расширения .js: "${spec}" (в ${filePath}) — ` +
          `нативный ESM-резолвер его не найдёт, нужно "${spec}.js"`,
      );
      continue;
    }

    if (!spec.startsWith(".")) continue; // внешний npm-пакет — пропускаем

    if (!/\.(ts|tsx|js|mjs|json)$/.test(spec)) {
      errors.push(`Импорт без явного расширения: "${spec}" (в ${filePath})`);
      continue;
    }

    if (
      /\/modules\/[^/]+\/index\.ts$/.test(spec) ||
      spec.endsWith("/modules")
    ) {
      errors.push(
        `Похоже на импорт барели фичемодуля вместо конкретного lib-файла: "${spec}" (в ${filePath})`,
      );
    }

    const resolved = resolve(dirname(filePath), spec);
    checkFile(resolved);
  }
}

checkFile(ENTRY);

if (errors.length > 0) {
  console.error(
    `\n❌ Найдено ${errors.length} нарушений в графе payload.config.ts:\n`,
  );
  for (const e of errors) console.error(" - " + e);
  console.error(
    "\nВесь граф, достижимый из payload.config.ts, обязан использовать только " +
      "относительные импорты с явным расширением файла (Node ESM resolver, без bundler-магии).\n",
  );
  process.exit(1);
}

console.log(
  `✅ Граф payload.config.ts чист: проверено ${visited.size} файлов.`,
);
