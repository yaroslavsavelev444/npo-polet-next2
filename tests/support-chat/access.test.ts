/**
 * Границы доступа чата без базы: кто считается участником (permissions.ts),
 * чей это диалог, и что шлюз берёт из рукопожатия (gateway/auth.ts) —
 * заголовки сессии, IP за nginx, «тот же ли человек» при повторной проверке.
 *
 * Идёт в общем `pnpm test` и под Stryker (зона «чат поддержки»).
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Payload } from "payload";
import type { Admin, User } from "../../payload-types.ts";
import { SupportError } from "../../src/modules/support-chat/server/errors.ts";
import {
	authenticate,
	clientIp,
	isAllowedHandshakeSource,
	pickAuthHeaders,
	sameActor,
} from "../../src/modules/support-chat/server/gateway/auth.ts";
import {
	assertCanAccessConversation,
	CHAT_BANNED_MESSAGE,
	canAccessConversation,
	customerActorFromUser,
	type SupportActor,
	staffActorFromAdmin,
} from "../../src/modules/support-chat/server/permissions.ts";

const user = (overrides: Partial<User> = {}) =>
	({
		id: 7,
		name: "Покупатель",
		email: "c@example.test",
		status: "active",
		collection: "users",
		...overrides,
	}) as unknown as User;

const admin = (overrides: Partial<Admin> = {}) =>
	({
		id: 7,
		name: "Ольга Иванова",
		email: "a@example.test",
		role: "admin",
		collection: "admins",
		...overrides,
	}) as unknown as Admin;

const customer: SupportActor = {
	kind: "customer",
	userId: 7,
	name: "Покупатель",
	email: "c@example.test",
	chatBanned: false,
};
const staff: SupportActor = {
	kind: "staff",
	adminId: 7,
	name: "Ольга",
	role: "admin",
};

describe("участник из учётной записи", () => {
	test("активный покупатель — участник, запрет чата переносится", () => {
		assert.deepEqual(customerActorFromUser(user({ id: "7" as never })), {
			kind: "customer",
			userId: 7,
			name: "Покупатель",
			email: "c@example.test",
			chatBanned: false,
		});
		assert.equal(
			customerActorFromUser(user({ supportChatBanned: true }))?.chatBanned,
			true,
		);
		assert.equal(
			customerActorFromUser(user({ supportChatBanned: null as never }))
				?.chatBanned,
			false,
		);
	});

	test("заблокированный и приостановленный — не участники", () => {
		assert.equal(customerActorFromUser(user({ status: "blocked" })), null);
		assert.equal(customerActorFromUser(user({ status: "suspended" })), null);
	});

	test("менеджер — любой admin/superadmin; имя «для покупателей» важнее", () => {
		assert.deepEqual(staffActorFromAdmin(admin()), {
			kind: "staff",
			adminId: 7,
			name: "Ольга Иванова",
			role: "admin",
		});
		assert.equal(
			staffActorFromAdmin(admin({ role: "superadmin" }))?.role,
			"superadmin",
		);
		assert.equal(
			staffActorFromAdmin(admin({ support: { displayName: "  Ольга " } }))
				?.name,
			"Ольга",
		);
		assert.equal(
			staffActorFromAdmin(admin({ support: { displayName: "   " } }))?.name,
			"Ольга Иванова",
		);
		assert.equal(
			staffActorFromAdmin(admin({ support: {} as never }))?.name,
			"Ольга Иванова",
		);
		assert.equal(staffActorFromAdmin(admin({ role: "editor" as never })), null);
	});

	test("текст запрета чата не пустой", () => {
		assert.match(CHAT_BANNED_MESSAGE, /нельзя/);
	});
});

describe("доступ к диалогу", () => {
	test("персонал — к любому, покупатель — только к своему", () => {
		assert.equal(canAccessConversation(staff, { userId: 1 }), true);
		assert.equal(canAccessConversation(staff, { userId: null }), true);
		assert.equal(canAccessConversation(customer, { userId: 7 }), true);
		assert.equal(canAccessConversation(customer, { userId: 8 }), false);
	});

	test("обезличенный диалог (user_id = null) покупателю не принадлежит", () => {
		assert.equal(canAccessConversation(customer, { userId: null }), false);
	});

	test("«нет такого» и «чужой» — одна и та же ошибка not_found", () => {
		for (const conversation of [null, { userId: 8 }, { userId: null }]) {
			assert.throws(
				() => assertCanAccessConversation(customer, conversation),
				(error: unknown) =>
					error instanceof SupportError &&
					error.code === "not_found" &&
					error.message === "Диалог не найден",
			);
		}
		assert.doesNotThrow(() =>
			assertCanAccessConversation(customer, { userId: 7 }),
		);
		assert.throws(() => assertCanAccessConversation(staff, null), SupportError);
	});
});

describe("рукопожатие шлюза", () => {
	test("из заголовков берутся только cookie, Origin и Sec-Fetch-Site", () => {
		assert.deepEqual(
			pickAuthHeaders({
				cookie: "payload-token=t",
				origin: "https://npo-polet.ru",
				"sec-fetch-site": "same-origin",
				authorization: "Bearer x",
			}),
			{
				cookie: "payload-token=t",
				origin: "https://npo-polet.ru",
				secFetchSite: "same-origin",
			},
		);
		assert.deepEqual(pickAuthHeaders({}), {
			cookie: undefined,
			origin: undefined,
			secFetchSite: undefined,
		});
		// Повторённый заголовок приходит массивом — такой не берём.
		assert.deepEqual(
			pickAuthHeaders({
				cookie: ["a=1", "b=2"] as never,
				origin: ["https://a", "https://b"] as never,
				"sec-fetch-site": ["a", "b"] as never,
			}),
			{ cookie: undefined, origin: undefined, secFetchSite: undefined },
		);
	});

	test("IP: X-Real-IP, иначе ПОСЛЕДНИЙ из X-Forwarded-For, иначе адрес сокета", () => {
		assert.equal(clientIp({ "x-real-ip": " 1.1.1.1 " }, "9.9.9.9"), "1.1.1.1");
		assert.equal(
			clientIp({ "x-real-ip": ["2.2.2.2", "3.3.3.3"] as never }, "9.9.9.9"),
			"2.2.2.2",
		);
		assert.equal(
			clientIp(
				{
					"x-real-ip": "  ",
					"x-forwarded-for": "7.7.7.7, 6.6.6.6, 5.5.5.5 , ",
				},
				"9.9.9.9",
			),
			"5.5.5.5",
		);
		assert.equal(
			clientIp(
				{ "x-forwarded-for": ["6.6.6.6", "4.4.4.4"] as never },
				"9.9.9.9",
			),
			"4.4.4.4",
		);
		assert.equal(clientIp({ "x-forwarded-for": " , " }, "9.9.9.9"), "9.9.9.9");
		assert.equal(clientIp({}, "9.9.9.9"), "9.9.9.9");
	});

	test("тот же участник: вид и id вместе (users#7 ≠ admins#7)", () => {
		assert.equal(sameActor(customer, { ...customer, name: "другое" }), true);
		assert.equal(sameActor(customer, { ...customer, userId: 8 }), false);
		assert.equal(sameActor(staff, { ...staff, name: "другое" }), true);
		assert.equal(sameActor(staff, { ...staff, adminId: 8 }), false);
		assert.equal(sameActor(customer, staff), false);
		assert.equal(sameActor(staff, customer), false);
		// Решает вид, даже если у объектов совпали оба id.
		const both = { userId: 7, adminId: 7 };
		assert.equal(
			sameActor({ ...customer, ...both }, {
				...staff,
				...both,
			} as SupportActor),
			false,
		);
		assert.equal(
			sameActor({ ...staff, ...both }, {
				...customer,
				...both,
			} as SupportActor),
			false,
		);
	});
});

describe("authenticate", () => {
	type AuthArgs = { headers: Headers };
	const fakePayload = (result: unknown | Error) => {
		const seen: Headers[] = [];
		const payload = {
			auth: async ({ headers }: AuthArgs) => {
				seen.push(headers);
				if (result instanceof Error) throw result;
				return { user: result };
			},
		} as unknown as Payload;
		return { payload, seen };
	};

	test("без cookie Payload не спрашивается", async () => {
		const { payload, seen } = fakePayload(user());
		assert.equal(await authenticate(payload, {}), null);
		assert.equal(seen.length, 0);
	});

	test("Payload получает cookie, Origin и Sec-Fetch-Site — и только их", async () => {
		const { payload, seen } = fakePayload(user());
		const actor = await authenticate(payload, {
			cookie: "payload-token=t",
			origin: "https://npo-polet.ru",
			secFetchSite: "same-origin",
		});
		assert.equal(actor?.kind, "customer");
		assert.deepEqual(Object.fromEntries(seen[0]), {
			cookie: "payload-token=t",
			origin: "https://npo-polet.ru",
			"sec-fetch-site": "same-origin",
		});

		await authenticate(payload, { cookie: "payload-token=t" });
		assert.deepEqual(Object.fromEntries(seen[1]), {
			cookie: "payload-token=t",
		});
	});

	test("покупатель, менеджер, заблокированный, чужая коллекция, ошибка", async () => {
		const run = (result: unknown) =>
			authenticate(fakePayload(result).payload, { cookie: "c" });
		assert.equal((await run(user()))?.kind, "customer");
		assert.equal((await run(admin()))?.kind, "staff");
		assert.equal(await run(user({ status: "blocked" })), null);
		assert.equal(await run({ ...admin(), role: "editor" }), null);
		assert.equal(await run({ ...admin(), collection: "other" }), null);
		assert.equal(await run(null), null);
		assert.equal(await run(new Error("jwt malformed")), null);
	});
});

describe("источник рукопожатия — запасной путь по Referer", () => {
	test("битый Referer — строго false, а не «ничего»", () => {
		const allowed = ["https://npo-polet.ru"];
		assert.strictEqual(
			isAllowedHandshakeSource({ referer: "не адрес" }, allowed),
			false,
		);
		assert.strictEqual(
			isAllowedHandshakeSource({ referer: "https://npo-polet.ru/x" }, allowed),
			true,
		);
		assert.strictEqual(isAllowedHandshakeSource({}, allowed), false);
	});
});
