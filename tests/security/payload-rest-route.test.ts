import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

/**
 * REST-роут Payload обязан быть ОБЯЗАТЕЛЬНЫМ catch-all: app/(payload)/api/[...slug].
 *
 * Обработчик Payload (@payloadcms/next/routes/rest) делает
 * `params.slug.map(...)` без проверки. С необязательным `[[...slug]]` запрос
 * ровно на `/api` (его регулярно шлют сканеры) приходит без slug и падает
 * «Cannot read properties of undefined (reading 'map')» — 500 и письмо о сбое.
 * С `[...slug]` голый `/api` роуту не соответствует и получает 404.
 *
 * Запуск: pnpm test:security
 */
test("REST-роут Payload — [...slug], а не [[...slug]]", () => {
	assert.ok(existsSync("app/(payload)/api/[...slug]/route.ts"));
	assert.ok(!existsSync("app/(payload)/api/[[...slug]]"));
});
