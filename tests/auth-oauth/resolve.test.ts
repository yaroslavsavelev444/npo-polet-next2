/**
 * Развилка входа через Яндекс ID (oauth/resolve.ts) и привязки
 * (oauth/identities.ts) на настоящем Postgres, плюс чистые функции потока.
 *
 *   pnpm test:oauth
 *
 * Главное, что здесь сторожится: совпадение почты НИКОГДА не даёт входа и
 * не создаёт привязку само по себе.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "@payloadcms/db-postgres";
import { getPayload, type Payload } from "payload";
import config from "../../payload.config.ts";
import {
	findIdentity,
	linkIdentity,
	listIdentities,
} from "../../src/modules/auth/oauth/identities.ts";
import {
	codeChallengeFor,
	sameOpaqueValue,
} from "../../src/modules/auth/oauth/pkce.ts";
import { resolveOAuthProfile } from "../../src/modules/auth/oauth/resolve.ts";
import { resolveOAuthReturnPath } from "../../src/modules/auth/oauth/returnPath.ts";
import {
	isYandexOwnedEmail,
	type YandexProfile,
} from "../../src/modules/auth/oauth/yandex.ts";

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let payload: Payload;
const userIds: number[] = [];

const subject = (name: string) => `test-${RUN}-${name}`;
const email = (name: string) => `oauth-resolve-${name}-${RUN}@example.test`;

async function createUser(name: string, data: Record<string, unknown> = {}) {
	const user = await payload.create({
		collection: "users",
		data: {
			email: email(name),
			password: `Resolve-Test-${RUN}-1`,
			name: "Тест",
			role: "user",
			status: "active",
			...data,
		},
		overrideAccess: true,
	});
	userIds.push(Number(user.id));
	return Number(user.id);
}

function profile(
	p: Partial<YandexProfile> & { subject: string },
): YandexProfile {
	return { email: null, name: "Тест", ...p };
}

const resolve = (
	p: YandexProfile,
	intent: "login" | "link" = "login",
	linkUserId?: string,
) =>
	resolveOAuthProfile(payload, {
		provider: "yandex",
		profile: p,
		intent,
		linkUserId,
	});

before(async () => {
	payload = await getPayload({ config });
});

after(async () => {
	await payload.db.drizzle.execute(
		sql`DELETE FROM user_identities WHERE subject LIKE ${`test-${RUN}-%`}`,
	);
	if (userIds.length) {
		await payload.db.drizzle.execute(
			sql`DELETE FROM users WHERE id IN (${sql.join(
				userIds.map((id) => sql`${id}`),
				sql`, `,
			)})`,
		);
	}
	await payload.destroy();
});

describe("resolveOAuthProfile", () => {
	test("совпадение почты → только код, привязка не создаётся", async () => {
		const id = await createUser("existing");
		const result = await resolve(
			profile({ subject: subject("existing"), email: email("existing") }),
		);
		assert.equal(result.kind, "link_required");
		assert.equal(result.kind === "link_required" && result.userId, id);
		assert.equal(
			await findIdentity(payload, "yandex", subject("existing")),
			null,
		);
	});

	test("привязка есть → вход по ней, даже если почта в Яндексе сменилась", async () => {
		const id = await createUser("linked");
		await linkIdentity(payload, {
			userId: id,
			provider: "yandex",
			subject: subject("linked"),
			email: email("linked"),
		});
		const result = await resolve(
			profile({ subject: subject("linked"), email: "someone-else@yandex.ru" }),
		);
		assert.equal(result.kind, "login");
		assert.equal(result.kind === "login" && result.userId, id);
	});

	test("заблокированному и приостановленному код не шлётся", async () => {
		await createUser("blocked", { status: "blocked" });
		await createUser("suspended", { status: "suspended" });
		const blocked = await resolve(
			profile({ subject: subject("b"), email: email("blocked") }),
		);
		const suspended = await resolve(
			profile({ subject: subject("s"), email: email("suspended") }),
		);
		assert.deepEqual(blocked, { kind: "error", code: "account_blocked" });
		assert.deepEqual(suspended, { kind: "error", code: "account_suspended" });
	});

	test("новая почта → регистрация; доверие только к доменам Яндекса", async () => {
		const ya = await resolve(
			profile({ subject: subject("n1"), email: `new-${RUN}@yandex.ru` }),
		);
		const other = await resolve(
			profile({ subject: subject("n2"), email: `new-${RUN}@gmail.com` }),
		);
		assert.equal(ya.kind === "signup" && ya.emailTrusted, true);
		assert.equal(other.kind === "signup" && other.emailTrusted, false);
	});

	test("у аккаунта Яндекса нет почты → no_email", async () => {
		assert.deepEqual(await resolve(profile({ subject: subject("nomail") })), {
			kind: "error",
			code: "no_email",
		});
	});

	test("привязка из кабинета: создаётся, повтор — без изменений, чужая — отказ", async () => {
		const owner = await createUser("owner");
		const other = await createUser("other");

		const first = await resolve(
			profile({ subject: subject("cab") }),
			"link",
			String(owner),
		);
		assert.deepEqual(first, { kind: "linked", userId: owner, created: true });

		const again = await resolve(
			profile({ subject: subject("cab") }),
			"link",
			String(owner),
		);
		assert.deepEqual(again, { kind: "linked", userId: owner, created: false });

		const foreign = await resolve(
			profile({ subject: subject("cab") }),
			"link",
			String(other),
		);
		assert.deepEqual(foreign, {
			kind: "error",
			code: "already_linked_elsewhere",
		});
		assert.equal((await listIdentities(payload, other)).length, 0);
	});

	test("две вкладки привязывают одновременно — одна запись", async () => {
		const id = await createUser("race");
		const results = await Promise.all(
			Array.from({ length: 5 }, () =>
				linkIdentity(payload, {
					userId: id,
					provider: "yandex",
					subject: subject("race"),
					email: null,
				}),
			),
		);
		assert.ok(results.every((r) => r.ok));
		assert.equal(results.filter((r) => r.ok && r.created).length, 1);
		assert.equal((await listIdentities(payload, id)).length, 1);
	});
});

describe("чистые функции потока", () => {
	test("PKCE S256 — эталонный вектор RFC 7636 (приложение B)", () => {
		assert.equal(
			codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
			"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
		);
	});

	test("state сравнивается целиком", () => {
		assert.equal(sameOpaqueValue("abc", "abc"), true);
		assert.equal(sameOpaqueValue("abc", "abd"), false);
		assert.equal(sameOpaqueValue("abc", "abcd"), false);
	});

	test("адрес возврата: только свой сайт и не страницы входа", () => {
		const r = (from: string | null) =>
			resolveOAuthReturnPath(from, {
				origin: "https://npo-polet.ru",
				fallback: "/profile",
			});
		assert.equal(r("/cart?step=2"), "/cart?step=2");
		assert.equal(r(null), "/profile");
		assert.equal(r("https://evil.example/x"), "/profile");
		assert.equal(r("//evil.example/x"), "/profile");
		assert.equal(r("/\\evil.example"), "/profile");
		assert.equal(r("/auth/login"), "/profile");
		assert.equal(r("/auth/yandex/callback?code=1"), "/profile");
		assert.equal(r("/auth/verify-otp"), "/profile");
	});

	test("домены почты Яндекса", () => {
		assert.equal(isYandexOwnedEmail("a@yandex.ru"), true);
		assert.equal(isYandexOwnedEmail("a@YA.RU"), true);
		assert.equal(isYandexOwnedEmail("a@yandex.ru.evil.com"), false);
		assert.equal(isYandexOwnedEmail("yandex.ru@gmail.com"), false);
	});
});
