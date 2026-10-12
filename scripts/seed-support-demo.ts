/**
 * Демо-данные чата поддержки для локальной разработки.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types \
 *     --import ./tests/support/next-subpath-resolver.mjs scripts/seed-support-demo.ts
 *
 * Создаёт (или переиспользует) демо-менеджера и демо-покупателя, кладёт
 * покупателя в пилотную группу чата, заводит заготовку с триггером и диалог
 * с несколькими сообщениями — всё через сервис модуля, то есть зашифрованным,
 * как в жизни. Учётные данные пишутся в db/support-demo.json (каталог db/ в
 * .gitignore) — пароль генерируется на месте и нигде больше не печатается.
 *
 * Только для локальной базы: на проде скрипт откажется работать.
 */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sql } from "@payloadcms/db-postgres";
import Redis from "ioredis";
import { getPayload } from "payload";
import config from "../payload.config.ts";
import { redisConfig } from "../src/modules/auth/lib/redis-config.ts";
import type { Broadcaster } from "../src/modules/support-chat/server/broadcast.ts";
import { invalidateSupportConfig } from "../src/modules/support-chat/server/settings.ts";
import * as service from "../src/modules/support-chat/server/support.service.ts";

if (process.env.NODE_ENV === "production") {
	console.error("Демо-данные на проде не создаются.");
	process.exit(1);
}

const CREDENTIALS = "db/support-demo.json";
const CUSTOMER_EMAIL = "support-demo-customer@example.test";
const MANAGER_EMAIL = "support-demo-manager@example.test";
const CONSENT_SLUG = "support-chat-demo-consent";

const stored = existsSync(CREDENTIALS)
	? (JSON.parse(readFileSync(CREDENTIALS, "utf8")) as { password: string })
	: { password: `Demo-${randomBytes(9).toString("base64url")}` };

const payload = await getPayload({ config });
const redis = new Redis(redisConfig);
const silent: Broadcaster = {
	to: () => ({ emit: () => true }),
	in: () => ({ disconnectSockets: () => undefined }),
};
const deps = { payload, redis, broadcaster: silent };

async function upsert(
	collection: "users" | "admins",
	email: string,
	data: Record<string, unknown>,
) {
	const found = await payload.find({
		collection,
		where: { email: { equals: email } },
		limit: 1,
		overrideAccess: true,
	});
	if (found.docs[0]) {
		return payload.update({
			collection,
			id: found.docs[0].id,
			data: { ...data, password: stored.password },
			overrideAccess: true,
		});
	}
	return payload.create({
		collection,
		data: { email, password: stored.password, ...data } as never,
		overrideAccess: true,
	});
}

const manager = await upsert("admins", MANAGER_EMAIL, {
	name: "Анна Демо",
	role: "admin",
	support: { displayName: "Анна" },
});
const customer = await upsert("users", CUSTOMER_EMAIL, {
	name: "Иван Петров",
	role: "user",
	status: "active",
});

await payload.db.drizzle.execute(sql`
	INSERT INTO consents (title, slug, content, needs_acceptance, is_active, version)
	VALUES ('Согласие для чата (демо)', ${CONSENT_SLUG}, 'Демо', TRUE, TRUE, '1.0.0')
	ON CONFLICT (slug) DO NOTHING
`);
// Виджет принимает то же согласие, что и форма контактов (personal-data). На
// проде документ есть; в чистой локальной базе — нет, и первое сообщение
// из виджета упиралось бы в «документ согласия не найден».
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
allowlist.add(Number(customer.id));
await payload.updateGlobal({
	slug: "support-settings",
	data: { betaAllowlist: [...allowlist] },
	overrideAccess: true,
});
invalidateSupportConfig();

const cannedExists = await payload.find({
	collection: "support-canned-responses",
	where: { shortcut: { equals: "серт" } },
	limit: 1,
	overrideAccess: true,
});
if (!cannedExists.docs[0]) {
	await payload.create({
		collection: "support-canned-responses",
		data: {
			title: "Сертификаты соответствия",
			shortcut: "серт",
			body: "{{имя}}, здравствуйте! Сертификаты на нашу продукцию высылаю во вложении. Если нужен документ на конкретную партию — напишите номер заказа. {{менеджер}}",
			triggers: [
				{ phrase: "сертификат" },
				{ phrase: "декларация соответствия" },
			],
			topics: ["documents"],
			scope: "shared",
		},
		overrideAccess: true,
	});
}

const customerActor = {
	kind: "customer" as const,
	userId: Number(customer.id),
	name: String(customer.name),
	email: CUSTOMER_EMAIL,
	chatBanned: false,
};
const managerActor = {
	kind: "staff" as const,
	adminId: Number(manager.id),
	name: "Анна",
	role: "admin" as const,
};

const send = (body: string, extra: Record<string, unknown> = {}) =>
	service.sendCustomerMessage(deps, customerActor, {
		clientMessageId: randomUUID(),
		body,
		attachmentIds: [],
		...extra,
	});

const first = await send(
	"Здравствуйте! Подскажите, есть ли сертификаты на сеткомёт «Паук»?",
	{
		consent: { document: CONSENT_SLUG },
		topic: "documents",
		context: {
			type: "product",
			title: "Сеткомёт «Паук Дуплет»",
			url: "/category/setkomet-manual",
		},
	},
);
await service.sendStaffMessage(deps, managerActor, {
	conversationId: first.conversation.id,
	clientMessageId: randomUUID(),
	body: "Клиент из госзаказчиков — нужны документы под тендер.",
	kind: "note",
	attachmentIds: [],
	documentIds: [],
});
await send("И ещё: какой срок доставки до Екатеринбурга?");

mkdirSync("db", { recursive: true });
writeFileSync(
	CREDENTIALS,
	JSON.stringify(
		{
			note: "Локальные демо-учётки чата поддержки (scripts/seed-support-demo.ts)",
			manager: MANAGER_EMAIL,
			customer: CUSTOMER_EMAIL,
			password: stored.password,
			conversationId: first.conversation.id,
		},
		null,
		2,
	),
);
console.log(
	`Готово: диалог №${first.conversation.id}. Учётные данные — ${CREDENTIALS}.`,
);
await redis.quit();
process.exit(0);
