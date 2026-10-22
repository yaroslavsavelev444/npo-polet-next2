/**
 * Минимальная витрина для браузерных тестов на чистой базе (CI).
 *
 *   node --experimental-strip-types \
 *     --import ./tests/support/next-subpath-resolver.mjs scripts/seed-storefront-ci.ts
 *
 * После миграций база пуста, а витрине для e2e нужно немногое:
 *  • «Настройки сайта» — обязательны название и логотип (без строки settings
 *    шапка и подвал не рисуются, сид Яндекс ID не включает галочку);
 *  • логотип — медиафайл из public/brand;
 *  • документы согласий, которые принимают при регистрации и в чате:
 *    personal-data (обязательное), user-agreement; cookie — для баннера.
 *
 * Работает ТОЛЬКО на чистой базе: если в ней есть хоть один покупатель,
 * сотрудник, товар или заказ, скрипт ничего не делает и выходит с ошибкой.
 * Так боевая (или любая рабочая) база не получит документов-заглушек, даже
 * если скрипт запустить на ней по ошибке — например, с ноутбука с адресом
 * боевой базы в DATABASE_URI. Плюс отказ при NODE_ENV=production.
 *
 * Внутри — ничего не перезаписывает: существующие настройки и документы
 * остаются как были.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { sql } from "@payloadcms/db-postgres";
import { getPayload } from "payload";
import config from "../payload.config.ts";

if (process.env.NODE_ENV === "production") {
	console.error("Сид витрины для тестов на проде не запускается.");
	process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_ALT = "Логотип НПО «Полёт» (сид e2e)";

const payload = await getPayload({ config });
const db = payload.db.drizzle;

// ── Только чистая база ──────────────────────────────────────────────────────
// Данные, которых на пустой базе CI не бывает. Хоть одна строка — это рабочая
// база, и витрина-заглушка ей не нужна.
const occupied = (await db.execute(sql`
	SELECT 'users' AS "table" WHERE EXISTS (SELECT 1 FROM users)
	UNION ALL SELECT 'admins' WHERE EXISTS (SELECT 1 FROM admins)
	UNION ALL SELECT 'products' WHERE EXISTS (SELECT 1 FROM products)
	UNION ALL SELECT 'orders' WHERE EXISTS (SELECT 1 FROM orders)
`)) as { rows: { table: string }[] };
if (occupied.rows.length > 0) {
	console.error(
		`База не пустая (${occupied.rows.map((r) => r.table).join(", ")}) — сид витрины для тестов запускается только на чистой базе CI. Ничего не изменено.`,
	);
	process.exit(1);
}

// ── Настройки сайта ─────────────────────────────────────────────────────────
const settingsRow = (await db.execute(
	sql`SELECT id FROM settings LIMIT 1`,
)) as { rows: unknown[] };
if (settingsRow.rows.length === 0) {
	const existing = await payload.find({
		collection: "media",
		where: { alt: { equals: LOGO_ALT } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const logo =
		existing.docs[0] ??
		(await payload.create({
			collection: "media",
			data: { alt: LOGO_ALT },
			filePath: path.join(ROOT, "public/brand/polet-logo-black.png"),
			overrideAccess: true,
		}));
	await payload.updateGlobal({
		slug: "settings",
		data: { companyName: "НПО «Полёт»", logo: logo.id },
		overrideAccess: true,
	});
	console.log("Настройки сайта: созданы");
}

// ── Документы согласий ─────────────────────────────────────────────────────
const CONSENTS = [
	{
		slug: "personal-data",
		title: "Согласие на обработку персональных данных",
		isRequired: true,
		needsAcceptance: true,
	},
	{
		slug: "user-agreement",
		title: "Пользовательское соглашение",
		isRequired: true,
		needsAcceptance: true,
	},
	{
		slug: "cookie",
		title: "Политика использования cookie",
		isRequired: false,
		needsAcceptance: false,
	},
];
for (const consent of CONSENTS) {
	// SQL, а не payload.create: хук версионирования коллекции рассчитан на
	// правку в админке, а здесь нужна ровно одна редакция 1.0.0.
	const result = (await db.execute(sql`
		INSERT INTO consents (title, slug, content, is_required, needs_acceptance, is_active, version)
		VALUES (${consent.title}, ${consent.slug}, 'Текст документа для тестового стенда.',
			${consent.isRequired}, ${consent.needsAcceptance}, TRUE, '1.0.0')
		ON CONFLICT (slug) DO NOTHING
		RETURNING id
	`)) as { rows: unknown[] };
	if (result.rows.length > 0) console.log(`Согласие ${consent.slug}: создано`);
}

process.exit(0);
