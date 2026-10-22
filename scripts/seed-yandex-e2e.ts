/**
 * Подготовка и уборка E2E-прогона входа через Яндекс ID
 * (tests/e2e/specs/yandex-id.spec.ts).
 *
 *   node --experimental-strip-types \
 *     --import ./tests/support/next-subpath-resolver.mjs scripts/seed-yandex-e2e.ts on|off
 *
 * on (перед прогоном, идемпотентно):
 *  • галочка «Настройки сайта → Вход через Яндекс ID» включается, прежнее
 *    значение запоминается в tests/e2e/.auth/yandex-setting.json;
 *  • аккаунты прошлых прогонов (почта e2e.yandex-*) удаляются вместе с
 *    привязками (FK user_identities — CASCADE);
 *  • заводятся два аккаунта с паролем и без принятых согласий (как
 *    перенесённые со старого сайта): «почта занята → код» и привязка из
 *    кабинета — обе должны пройти через экран согласия (linkConsent.ts);
 *  • сбрасываются лимиты входа, регистрации и кодов с локального IP: прогон
 *    заводит несколько аккаунтов подряд, а `register` — 5 в час.
 *
 * off (после прогона): галочка возвращается к запомненному значению.
 */
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { sql } from "@payloadcms/db-postgres";
import Redis from "ioredis";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { redisConfig } from "../src/modules/auth/lib/redis-config.ts";

if (process.env.NODE_ENV === "production") {
	console.error("E2E-данные на проде не создаются.");
	process.exit(1);
}

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.resolve(DIRNAME, "../tests/e2e/.auth/yandex-setting.json");

export const YANDEX_E2E = {
	emailPattern: "e2e.yandex-%",
	existing: {
		email: "e2e.yandex-existing@example.test",
		password: "E2e-Yandex-Existing-2026!",
		name: "Яндекс Существующий",
	},
	cabinet: {
		email: "e2e.yandex-cabinet@example.test",
		password: "E2e-Yandex-Cabinet-2026!",
		name: "Яндекс Кабинет",
	},
};

const mode = process.argv[2];
if (mode !== "on" && mode !== "off") {
	console.error("Укажите on или off");
	process.exit(1);
}

const payload = await getPayload({ config });
const db = payload.db.drizzle;

// SQL, а не updateGlobal: тот валидирует весь глобал (название компании,
// логотип) — а менять нужно одну галочку.
async function setEnabled(enabled: boolean) {
	await db.execute(sql`UPDATE settings SET yandex_id_enabled = ${enabled}`);
}

if (mode === "off") {
	const previous = existsSync(STATE)
		? (JSON.parse(readFileSync(STATE, "utf8")) as { enabled: boolean }).enabled
		: false;
	await setEnabled(previous);
	rmSync(STATE, { force: true });
	process.exit(0);
}

const current = (await db.execute(
	sql`SELECT yandex_id_enabled AS enabled FROM settings LIMIT 1`,
)) as { rows: { enabled: boolean | null }[] };
if (!current.rows[0]) {
	// Пустая база (например, CI): витрине нужны «Настройки сайта» с
	// логотипом и названием — их сид не выдумывает.
	console.error("Нет строки settings — заполните «Настройки сайта» в админке.");
	process.exit(1);
}
mkdirSync(path.dirname(STATE), { recursive: true });
// Повторный запуск без off не должен запомнить уже включённую галочку.
if (!existsSync(STATE)) {
	writeFileSync(
		STATE,
		JSON.stringify({ enabled: Boolean(current.rows[0].enabled) }),
	);
}
await setEnabled(true);

const stale = (await db.execute(
	sql`SELECT id FROM users WHERE email LIKE ${YANDEX_E2E.emailPattern}`,
)) as { rows: { id: number }[] };
// Не payload.delete: FK `notifications.user_id` — set null на NOT NULL-колонке,
// и удаление падает. Тестовым аккаунтам ничего хранить не нужно — сносим
// строки всех таблиц, ссылающихся на users, затем сам аккаунт.
const staleIds = stale.rows.map((row) => Number(row.id));
if (staleIds.length > 0) {
	const refs = (await db.execute(sql`
		SELECT tc.table_name AS "table", kcu.column_name AS "column"
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
		JOIN information_schema.constraint_column_usage ccu
			ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users'
			AND tc.table_schema = 'public' AND tc.table_name <> 'users'
	`)) as { rows: { table: string; column: string }[] };
	const ids = sql.join(
		staleIds.map((id) => sql`${id}`),
		sql`, `,
	);
	await db.transaction(async (tx) => {
		for (const ref of refs.rows) {
			await tx.execute(
				sql`DELETE FROM ${sql.identifier(ref.table)} WHERE ${sql.identifier(ref.column)} IN (${ids})`,
			);
		}
		await tx.execute(sql`DELETE FROM users WHERE id IN (${ids})`);
	});
}

for (const account of [YANDEX_E2E.existing, YANDEX_E2E.cabinet]) {
	await payload.create({
		collection: "users",
		data: {
			email: account.email,
			password: account.password,
			name: account.name,
			role: "user",
			status: "active",
		},
		overrideAccess: true,
	});
}

const redis = new Redis(redisConfig);
for (const pattern of [
	"rl:oauth:*",
	"rl:register:*",
	"rl:otp_verify:*",
	"rl:otp_resend:*",
]) {
	const keys = await redis.keys(pattern);
	if (keys.length > 0) await redis.del(...keys);
}
await redis.quit();
process.exit(0);
