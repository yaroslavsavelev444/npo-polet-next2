/**
 * Развилка входа через Яндекс ID (oauth/resolve.ts) и привязки
 * (oauth/identities.ts) на настоящем Postgres. Чистые функции потока —
 * pure.test.ts (идёт и в `pnpm test`, и под Stryker).
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
	findOutdatedLinkConsents,
	LINK_CONSENT_SLUG,
} from "../../src/modules/auth/oauth/linkConsent.ts";
import { resolveOAuthProfile } from "../../src/modules/auth/oauth/resolve.ts";
import type { YandexProfile } from "../../src/modules/auth/oauth/yandex.ts";

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

/** Действующая редакция Согласия — в чистой базе (CI) документа нет. */
let consent: { id: number; version: string };

/** Покупатель принял редакцию `version` Согласия (как при регистрации). */
async function acceptConsent(userId: number, version: string) {
	await payload.create({
		collection: "user-consents",
		data: {
			user: userId,
			consent: consent.id,
			consentSlug: LINK_CONSENT_SLUG,
			version,
			acceptedAt: new Date().toISOString(),
			ip: "127.0.0.1",
			userAgent: "resolve-test",
		},
		overrideAccess: true,
	});
}

before(async () => {
	payload = await getPayload({ config });
	await payload.db.drizzle.execute(sql`
		INSERT INTO consents (title, slug, content, needs_acceptance, is_active, version)
		VALUES ('Согласие на обработку персональных данных (тест)', ${LINK_CONSENT_SLUG},
			'Тестовая редакция.', TRUE, TRUE, '1.0.0')
		ON CONFLICT (slug) DO NOTHING
	`);
	const row = (await payload.db.drizzle.execute(
		sql`SELECT id, version FROM consents WHERE slug = ${LINK_CONSENT_SLUG}`,
	)) as { rows: { id: number; version: string | null }[] };
	consent = {
		id: Number(row.rows[0].id),
		version: row.rows[0].version ?? "1.0.0",
	};
});

after(async () => {
	await payload.db.drizzle.execute(
		sql`DELETE FROM user_identities WHERE subject LIKE ${`test-${RUN}-%`}`,
	);
	if (userIds.length) {
		const ids = sql.join(
			userIds.map((id) => sql`${id}`),
			sql`, `,
		);
		await payload.db.drizzle.execute(
			sql`DELETE FROM user_consents WHERE user_id IN (${ids})`,
		);
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
		await acceptConsent(owner, consent.version);
		await acceptConsent(other, consent.version);

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

	test("старая редакция Согласия: привязка из кабинета ждёт согласия и ничего не создаёт", async () => {
		const id = await createUser("old-consent");
		await acceptConsent(id, `${consent.version}-old`);

		assert.equal((await findOutdatedLinkConsents(payload, id)).length, 1);
		const [outdated] = await findOutdatedLinkConsents(payload, id);
		assert.equal(outdated.slug, LINK_CONSENT_SLUG);
		assert.equal(outdated.version, consent.version);
		assert.equal(outdated.isRequired, true);

		const result = await resolve(
			profile({ subject: subject("old-consent") }),
			"link",
			String(id),
		);
		assert.deepEqual(result, { kind: "consent_required", userId: id });
		assert.equal(
			await findIdentity(payload, "yandex", subject("old-consent")),
			null,
		);

		// Принял действующую — привязка проходит сразу.
		await acceptConsent(id, consent.version);
		assert.deepEqual(await findOutdatedLinkConsents(payload, id), []);
		assert.deepEqual(
			await resolve(
				profile({ subject: subject("old-consent") }),
				"link",
				String(id),
			),
			{ kind: "linked", userId: id, created: true },
		);
	});

	test("согласий нет вовсе (перенесённый аккаунт) — тоже спрашиваем", async () => {
		const id = await createUser("no-consent");
		assert.equal((await findOutdatedLinkConsents(payload, id)).length, 1);
	});

	test("чужой Яндекс — отказ без экрана согласия; уже свой — без экрана", async () => {
		const owner = await createUser("cons-owner");
		const stranger = await createUser("cons-stranger");
		await acceptConsent(owner, consent.version);
		await linkIdentity(payload, {
			userId: owner,
			provider: "yandex",
			subject: subject("cons"),
			email: null,
		});
		await acceptConsent(owner, `${consent.version}-old`);

		assert.deepEqual(
			await resolve(
				profile({ subject: subject("cons") }),
				"link",
				String(stranger),
			),
			{ kind: "error", code: "already_linked_elsewhere" },
		);
		assert.deepEqual(
			await resolve(
				profile({ subject: subject("cons") }),
				"link",
				String(owner),
			),
			{ kind: "linked", userId: owner, created: false },
		);
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
