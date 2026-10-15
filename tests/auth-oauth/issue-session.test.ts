/**
 * Выдача сессии без пароля (src/modules/auth/oauth/issueSession.ts) на
 * настоящем Postgres.
 *
 *   pnpm test:oauth
 *
 * Это место повторяет внутренности payload.login(), поэтому проверяется
 * результатом, а не устройством: токен должен приниматься самим Payload,
 * отзываться теми же механизмами, что и токен обычного входа, и не
 * выдаваться тем, кого не пускает вход паролем.
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { sql } from "@payloadcms/db-postgres";
import { getPayload, type Payload } from "payload";
import config from "../../payload.config.ts";
import { revokeAllPayloadSessions } from "../../src/modules/auth/lib/payloadSessions.ts";
import { issueSessionWithoutPassword } from "../../src/modules/auth/oauth/issueSession.ts";

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let payload: Payload;
const userIds: number[] = [];

async function createUser(
	suffix: string,
	data: Record<string, unknown> = {},
): Promise<number> {
	const user = await payload.create({
		collection: "users",
		data: {
			email: `oauth-${suffix}-${RUN}@example.test`,
			password: `Oauth-Test-${RUN}-1`,
			name: `OAuth ${suffix}`,
			role: "user",
			status: "active",
			...data,
		},
		overrideAccess: true,
	});
	userIds.push(Number(user.id));
	return Number(user.id);
}

async function authenticate(token: string) {
	const { user } = await payload.auth({
		headers: new Headers({ Authorization: `JWT ${token}` }),
	});
	return user;
}

before(async () => {
	payload = await getPayload({ config });
});

after(async () => {
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

describe("issueSessionWithoutPassword", () => {
	test("токен принимается Payload и указывает на того пользователя", async () => {
		const id = await createUser("ok");
		const { token, email } = await issueSessionWithoutPassword(payload, id);

		const user = await authenticate(token);
		assert.equal(Number(user?.id), id);
		assert.equal(user?.collection, "users");
		assert.equal(email, `oauth-ok-${RUN}@example.test`);
	});

	test("«выйти со всех устройств» отзывает и такой токен", async () => {
		const id = await createUser("revoke");
		const { token } = await issueSessionWithoutPassword(payload, id);
		assert.ok(await authenticate(token));

		await revokeAllPayloadSessions(payload, id);
		assert.equal(await authenticate(token), null);
	});

	test("несколько входов подряд — независимые сессии", async () => {
		const id = await createUser("multi");
		const first = await issueSessionWithoutPassword(payload, id);
		const second = await issueSessionWithoutPassword(payload, id);
		assert.ok(await authenticate(first.token));
		assert.ok(await authenticate(second.token));
	});

	test("истёкшие строки сессий убираются при новом входе", async () => {
		const id = await createUser("purge");
		await payload.db.drizzle.execute(sql`
			INSERT INTO users_sessions (_order, _parent_id, id, created_at, expires_at)
			VALUES (1, ${id}, ${`expired-${RUN}`}, now() - interval '9 days', now() - interval '2 days')
		`);
		await issueSessionWithoutPassword(payload, id);
		const result = (await payload.db.drizzle.execute(sql`
			SELECT count(*)::int AS n FROM users_sessions WHERE id = ${`expired-${RUN}`}
		`)) as { rows: { n: number }[] };
		assert.equal(result.rows[0].n, 0);
	});

	test("заблокированному и приостановленному — отказ, сессия не создаётся", async () => {
		for (const status of ["blocked", "suspended"] as const) {
			const id = await createUser(status, { status });
			await assert.rejects(() => issueSessionWithoutPassword(payload, id));
			const result = (await payload.db.drizzle.execute(sql`
				SELECT count(*)::int AS n FROM users_sessions WHERE _parent_id = ${id}
			`)) as { rows: { n: number }[] };
			assert.equal(result.rows[0].n, 0, status);
		}
	});

	test("блокировка по подбору пароля вход через сервис не запирает", async () => {
		const id = await createUser("locked");
		await payload.db.drizzle.execute(sql`
			UPDATE users SET login_attempts = 10, lock_until = now() + interval '15 minutes'
			WHERE id = ${id}
		`);
		const { token } = await issueSessionWithoutPassword(payload, id);
		assert.ok(await authenticate(token));

		// и счётчик попыток не сброшен — он про пароль
		const result = (await payload.db.drizzle.execute(sql`
			SELECT login_attempts FROM users WHERE id = ${id}
		`)) as { rows: { login_attempts: string | number }[] };
		assert.equal(Number(result.rows[0].login_attempts), 10);
	});
});
