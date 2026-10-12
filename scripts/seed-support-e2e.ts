/**
 * Подготовка E2E-прогона чата поддержки (tests/e2e/specs/support-chat.spec.ts).
 *
 * Идемпотентен — Playwright зовёт его перед каждым прогоном:
 *  • покупатель и менеджер с постоянными адресами, пароли переписываются;
 *  • покупатель — в пилотной группе (чат работает, даже если выключен для
 *    всех), прошлая его переписка удаляется целиком: у покупателя может быть
 *    только один открытый диалог, и прогон должен начинаться с чистого листа;
 *  • лимиты шлюза на сообщения покупателя сбрасываются;
 *  • документ согласия personal-data — в чистой локальной базе его нет;
 *  • storageState обеих сторон — tests/e2e/.auth/support-*.json.
 *
 * Вход — как в seed-checkout-e2e.ts: payload.login + запись Sessions, без OTP.
 *
 *   node --experimental-strip-types \
 *     --import ./tests/support/next-subpath-resolver.mjs scripts/seed-support-e2e.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { sql } from "@payloadcms/db-postgres";
import Redis from "ioredis";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { redisConfig } from "../src/modules/auth/lib/redis-config.ts";
import { AUTH_FLOW_CONTEXT } from "../src/payload/hooks/users/requireServerAuthFlow.ts";

if (process.env.NODE_ENV === "production") {
	console.error("E2E-данные на проде не создаются.");
	process.exit(1);
}

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIRNAME, "..");
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export const SUPPORT_E2E = {
	customer: {
		email: "e2e.support-customer@example.test",
		password: "E2e-Support-Customer-2026!",
		name: "Чат Покупатель",
	},
	manager: {
		email: "e2e.support-manager@example.test",
		password: "E2e-Support-Manager-2026!",
		name: "E2E Менеджер чата",
		displayName: "Ольга",
	},
};

function extractSid(token: string): string | null {
	try {
		const decoded = JSON.parse(
			Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
		) as { sid?: unknown };
		return typeof decoded.sid === "string" ? decoded.sid : null;
	} catch {
		return null;
	}
}

const payload = await getPayload({ config });

async function upsert(
	collection: "users" | "admins",
	email: string,
	data: Record<string, unknown>,
): Promise<number> {
	const found = await payload.find({
		collection,
		where: { email: { equals: email } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const doc = found.docs[0]
		? await payload.update({
				collection,
				id: found.docs[0].id,
				data: data as never,
				overrideAccess: true,
			})
		: await payload.create({
				collection,
				data: { email, ...data } as never,
				overrideAccess: true,
			});
	return Number(doc.id);
}

const { customer, manager } = SUPPORT_E2E;
const userId = await upsert("users", customer.email, {
	password: customer.password,
	name: customer.name,
	role: "user",
	status: "active",
	supportChatBanned: false,
});
await upsert("admins", manager.email, {
	password: manager.password,
	name: manager.name,
	role: "admin",
	support: { displayName: manager.displayName },
});

// Прошлая переписка — целиком. Файлы на диске без записей уберёт шлюз
// (purgeOrphanFiles), они и так нечитаемы без ключа диалога.
await payload.db.drizzle.transaction(async (tx) => {
	const own = sql`SELECT id FROM support_conversations WHERE user_id = ${userId}`;
	await tx.execute(sql`
		DELETE FROM support_attachments
		WHERE conversation_id IN (${own}) OR uploaded_by_user_id = ${userId}
	`);
	await tx.execute(
		sql`DELETE FROM support_messages WHERE conversation_id IN (${own})`,
	);
	await tx.execute(
		sql`DELETE FROM support_conversations_texts WHERE parent_id IN (${own})`,
	);
	await tx.execute(
		sql`DELETE FROM support_conversations WHERE user_id = ${userId}`,
	);
	await tx.execute(
		sql`DELETE FROM notifications WHERE user_id = ${userId} AND type = 'chat'`,
	);
});

// Лимиты шлюза (5 новых диалогов в сутки) — иначе шестой прогон за день
// упрётся в «Слишком часто».
const redis = new Redis(redisConfig);
await redis.del(
	`rl:support:msg:min:${userId}`,
	`rl:support:msg:day:${userId}`,
	`rl:support:conv:day:${userId}`,
);
await redis.quit();

await payload.db.drizzle.execute(sql`
	INSERT INTO consents (title, slug, content, needs_acceptance, is_active, version)
	VALUES ('Согласие на обработку персональных данных (локальная заглушка)',
		'personal-data', 'Локальная заглушка для разработки.', TRUE, TRUE, '1.0.0')
	ON CONFLICT (slug) DO NOTHING
`);

const settings = await payload.findGlobal({
	slug: "support-settings",
	depth: 0,
	overrideAccess: true,
});
const allowlist = new Set(
	(settings.betaAllowlist ?? []).map((u) =>
		Number(typeof u === "object" ? u.id : u),
	),
);
if (!allowlist.has(userId)) {
	allowlist.add(userId);
	await payload.updateGlobal({
		slug: "support-settings",
		data: { betaAllowlist: [...allowlist] },
		overrideAccess: true,
	});
	// Next и шлюз держат настройки в кэше до 30 с — спек ждёт кнопку дольше.
}

// ── Сессии ──────────────────────────────────────────────────────────────────
const customerLogin = await payload.login({
	collection: "users",
	data: { email: customer.email, password: customer.password },
	context: AUTH_FLOW_CONTEXT,
});
const now = new Date();
const week = 7 * 24 * 3600;
const session = await payload.create({
	collection: "sessions",
	data: {
		user: userId,
		payloadSessionId: extractSid(String(customerLogin.token)),
		ip: "127.0.0.1",
		userAgent: "playwright-e2e",
		deviceLabel: "Playwright (чат)",
		createdAt: now.toISOString(),
		lastActiveAt: now.toISOString(),
		expiresAt: new Date(now.getTime() + week * 1000).toISOString(),
		revoked: false,
	},
	overrideAccess: true,
});
const managerLogin = await payload.login({
	collection: "admins",
	data: { email: manager.email, password: manager.password },
});

const { hostname } = new URL(BASE_URL);
const cookie = (name: string, value: string) => ({
	name,
	value,
	domain: hostname,
	path: "/",
	expires: Math.floor(Date.now() / 1000) + week,
	httpOnly: true,
	secure: false,
	sameSite: "Lax" as const,
});

const authDir = path.join(ROOT, "tests/e2e/.auth");
mkdirSync(authDir, { recursive: true });
writeFileSync(
	path.join(authDir, "support-customer.json"),
	JSON.stringify(
		{
			cookies: [
				cookie("payload-token", String(customerLogin.token)),
				cookie("session-id", String((session as { id: number }).id)),
			],
			origins: [],
		},
		null,
		2,
	),
);
writeFileSync(
	path.join(authDir, "support-manager.json"),
	JSON.stringify(
		{
			cookies: [cookie("payload-token", String(managerLogin.token))],
			origins: [],
		},
		null,
		2,
	),
);

console.log(`E2E чата готов: покупатель ${userId}.`);
process.exit(0);
