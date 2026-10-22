/**
 * Чистые функции входа через Яндекс ID: PKCE и state, адрес возврата, домены
 * почты Яндекса, клиент oauth.yandex.ru / login.yandex.ru (на подменённом fetch).
 *
 * Ни базы, ни сети — поэтому идёт в общем `pnpm test` и служит набором для
 * мутационного тестирования (stryker.config.mjs, зона «вход через Яндекс»).
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
	codeChallengeFor,
	createCodeVerifier,
	createOpaqueId,
	sameOpaqueValue,
} from "../../src/modules/auth/oauth/pkce.ts";
import { resolveOAuthReturnPath } from "../../src/modules/auth/oauth/returnPath.ts";
import {
	buildYandexAuthorizeUrl,
	fetchYandexProfile,
	isYandexOwnedEmail,
	YANDEX_SCOPES,
	yandexOAuthBaseUrl,
} from "../../src/modules/auth/oauth/yandex.ts";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe("PKCE и state", () => {
	test("S256 — эталонный вектор RFC 7636 (приложение B)", () => {
		assert.equal(
			codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
			"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
		);
	});

	test("verifier и id потока: 32 байта base64url, каждый раз новые", () => {
		for (const make of [createCodeVerifier, createOpaqueId]) {
			const a = make();
			const b = make();
			assert.equal(a.length, 43);
			assert.match(a, BASE64URL);
			assert.notEqual(a, b);
		}
	});

	test("state сравнивается целиком", () => {
		assert.equal(sameOpaqueValue("abc", "abc"), true);
		assert.equal(sameOpaqueValue("abc", "abd"), false);
		assert.equal(sameOpaqueValue("abc", "abcd"), false);
		assert.equal(sameOpaqueValue("abcd", "abc"), false);
		assert.equal(sameOpaqueValue("", "a"), false);
	});
});

describe("адрес возврата", () => {
	const r = (from: string | null) =>
		resolveOAuthReturnPath(from, {
			origin: "https://npo-polet.ru",
			fallback: "/profile",
		});

	test("свой путь сохраняется вместе с запросом", () => {
		assert.equal(r("/cart?step=2"), "/cart?step=2");
		assert.equal(r("/auth"), "/auth");
		// Похоже на путь входа, но им не является.
		assert.equal(r("/auth/login-help"), "/auth/login-help");
		assert.equal(r("/auth/yandexish"), "/auth/yandexish");
	});

	test("чужой сайт и пустое значение — на запасной путь", () => {
		assert.equal(r(null), "/profile");
		assert.equal(r("https://evil.example/x"), "/profile");
		assert.equal(r("//evil.example/x"), "/profile");
		assert.equal(r("/\\evil.example"), "/profile");
	});

	test("страницы самого входа — на запасной путь (без петли)", () => {
		for (const path of [
			"/auth/login",
			"/auth/login?from=/cart",
			"/auth/register",
			"/auth/forgot-password",
			"/auth/password-reset",
			"/auth/verify-otp",
			"/auth/yandex",
			"/auth/yandex/callback?code=1",
			"/auth/yandex/complete",
		]) {
			assert.equal(r(path), "/profile", path);
		}
	});
});

describe("домены почты Яндекса", () => {
	test("все домены Яндекса, без учёта регистра", () => {
		for (const domain of [
			"yandex.ru",
			"ya.ru",
			"yandex.com",
			"yandex.by",
			"yandex.kz",
			"yandex.ua",
			"yandex.com.tr",
			"narod.ru",
		]) {
			assert.equal(isYandexOwnedEmail(`a@${domain}`), true, domain);
		}
		assert.equal(isYandexOwnedEmail("a@YA.RU"), true);
	});

	test("похожие и чужие домены — нет", () => {
		assert.equal(isYandexOwnedEmail("a@yandex.ru.evil.com"), false);
		assert.equal(isYandexOwnedEmail("yandex.ru@gmail.com"), false);
		assert.equal(isYandexOwnedEmail("a@mail.yandex.ru"), false);
		// Домен берётся после ПОСЛЕДНЕЙ @.
		assert.equal(isYandexOwnedEmail("a@yandex.ru@evil.com"), false);
	});
});

describe("адрес авторизации", () => {
	const saved = process.env.YANDEX_OAUTH_URL;
	afterEach(() => {
		if (saved === undefined) delete process.env.YANDEX_OAUTH_URL;
		else process.env.YANDEX_OAUTH_URL = saved;
	});

	test("PKCE S256, минимальные права, без force_confirm", () => {
		delete process.env.YANDEX_OAUTH_URL;
		const url = new URL(
			buildYandexAuthorizeUrl({
				clientId: "cid",
				redirectUri: "https://npo-polet.ru/auth/yandex/callback",
				state: "st",
				codeChallenge: "ch",
			}),
		);
		assert.equal(url.origin, "https://oauth.yandex.ru");
		assert.equal(url.pathname, "/authorize");
		assert.deepEqual(Object.fromEntries(url.searchParams), {
			response_type: "code",
			client_id: "cid",
			redirect_uri: "https://npo-polet.ru/auth/yandex/callback",
			state: "st",
			scope: "login:email login:info",
			code_challenge: "ch",
			code_challenge_method: "S256",
		});
		assert.deepEqual([...YANDEX_SCOPES], ["login:email", "login:info"]);
	});

	test("адрес мока из окружения, пробелы отбрасываются", () => {
		process.env.YANDEX_OAUTH_URL = "  http://127.0.0.1:4610  ";
		assert.equal(yandexOAuthBaseUrl(), "http://127.0.0.1:4610");
		process.env.YANDEX_OAUTH_URL = "   ";
		assert.equal(yandexOAuthBaseUrl(), "https://oauth.yandex.ru");
	});
});

// ─── Клиент: обмен кода и профиль ────────────────────────────────────────────

type Call = { url: string; init: RequestInit };
type Step = Response | Error;

const realFetch = globalThis.fetch;
const realWarn = console.warn;
let calls: Call[];
let warnings: unknown[][];

/** Подменяет fetch очередью ответов: Response — ответ, Error — сбой сети. */
function script(...steps: Step[]) {
	globalThis.fetch = (async (url: string | URL, init: RequestInit = {}) => {
		calls.push({ url: String(url), init });
		const step = steps.shift();
		if (!step) throw new Error("лишний запрос");
		if (step instanceof Error) throw step;
		return step;
	}) as typeof fetch;
}

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
/** Новый на каждый вызов: тело Response читается один раз. */
const token = () => json(200, { access_token: "tok", refresh_token: "r" });

const request = () =>
	fetchYandexProfile({
		code: "the-code",
		codeVerifier: "the-verifier",
		redirectUri: "https://npo-polet.ru/auth/yandex/callback",
		credentials: { clientId: "cid", clientSecret: "sec" },
	});

describe("fetchYandexProfile", () => {
	const savedLogin = process.env.YANDEX_LOGIN_URL;
	const savedOAuth = process.env.YANDEX_OAUTH_URL;

	beforeEach(() => {
		calls = [];
		warnings = [];
		delete process.env.YANDEX_LOGIN_URL;
		delete process.env.YANDEX_OAUTH_URL;
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};
	});
	afterEach(() => {
		globalThis.fetch = realFetch;
		console.warn = realWarn;
		if (savedLogin === undefined) delete process.env.YANDEX_LOGIN_URL;
		else process.env.YANDEX_LOGIN_URL = savedLogin;
		if (savedOAuth === undefined) delete process.env.YANDEX_OAUTH_URL;
		else process.env.YANDEX_OAUTH_URL = savedOAuth;
	});

	test("код → токен (Basic + verifier) → /info (OAuth) → профиль", async () => {
		script(
			token(),
			json(200, {
				id: 1234567,
				default_email: "  Ivan@Yandex.RU ",
				first_name: " Иван ",
				last_name: "Петров",
				sex: "male",
				login: "ivan",
			}),
		);
		const result = await request();
		assert.deepEqual(result, {
			ok: true,
			profile: {
				subject: "1234567",
				email: "ivan@yandex.ru",
				name: "Иван Петров",
			},
		});

		assert.equal(calls.length, 2);
		const [tokenCall, infoCall] = calls;
		assert.equal(tokenCall.url, "https://oauth.yandex.ru/token");
		assert.equal(tokenCall.init.method, "POST");
		assert.equal(tokenCall.init.cache, "no-store");
		assert.ok(tokenCall.init.signal instanceof AbortSignal);
		const headers = tokenCall.init.headers as Record<string, string>;
		assert.equal(
			headers.Authorization,
			`Basic ${Buffer.from("cid:sec").toString("base64")}`,
		);
		assert.equal(headers["Content-Type"], "application/x-www-form-urlencoded");
		assert.deepEqual(
			Object.fromEntries(tokenCall.init.body as URLSearchParams),
			{
				grant_type: "authorization_code",
				code: "the-code",
				code_verifier: "the-verifier",
				redirect_uri: "https://npo-polet.ru/auth/yandex/callback",
			},
		);

		assert.equal(infoCall.url, "https://login.yandex.ru/info?format=json");
		assert.deepEqual(infoCall.init.headers, { Authorization: "OAuth tok" });
		assert.equal(infoCall.init.cache, "no-store");
		assert.ok(infoCall.init.signal instanceof AbortSignal);
		assert.equal(warnings.length, 0);
	});

	test("адреса мока из окружения", async () => {
		process.env.YANDEX_OAUTH_URL = "http://127.0.0.1:4610";
		process.env.YANDEX_LOGIN_URL = " http://127.0.0.1:4611 ";
		script(token(), json(200, { id: "1" }));
		await request();
		assert.equal(calls[0].url, "http://127.0.0.1:4610/token");
		assert.equal(calls[1].url, "http://127.0.0.1:4611/info?format=json");
	});

	test("почта: default_email, иначе первая из emails; невалидная — нет почты", async () => {
		script(token(), json(200, { id: "1", emails: [" A@Ya.ru", "b@ya.ru"] }));
		assert.equal((await lastProfile()).email, "a@ya.ru");

		script(
			token(),
			json(200, {
				id: "1",
				default_email: "not-an-email",
				emails: ["c@ya.ru"],
			}),
		);
		assert.equal((await lastProfile()).email, "c@ya.ru");

		script(token(), json(200, { id: "1", default_email: "   ", emails: [] }));
		assert.equal((await lastProfile()).email, null);

		script(token(), json(200, { id: "1", default_email: null, emails: null }));
		assert.equal((await lastProfile()).email, null);
	});

	test("имя: имя+фамилия, иначе real_name, иначе display_name; не длиннее 100", async () => {
		script(
			token(),
			json(200, { id: "1", first_name: "Иван", last_name: "  " }),
		);
		assert.equal((await lastProfile()).name, "Иван");

		script(
			token(),
			json(200, { id: "1", last_name: "Петров", real_name: "Реальное" }),
		);
		assert.equal((await lastProfile()).name, "Петров");

		script(
			token(),
			json(200, { id: "1", real_name: " Реальное Имя ", display_name: "disp" }),
		);
		assert.equal((await lastProfile()).name, "Реальное Имя");

		script(
			token(),
			json(200, { id: "1", real_name: " ", display_name: " disp " }),
		);
		assert.equal((await lastProfile()).name, "disp");

		script(token(), json(200, { id: "1" }));
		assert.equal((await lastProfile()).name, "");

		script(token(), json(200, { id: "1", first_name: "Я".repeat(150) }));
		assert.equal((await lastProfile()).name.length, 100);
	});

	test("сеть упала на обмене — ровно один повтор", async () => {
		script(new Error("ECONNRESET"), token(), json(200, { id: "7" }));
		const result = await request();
		assert.equal(result.ok, true);
		assert.equal(calls.length, 3);
		assert.equal(calls[1].url, calls[0].url);

		calls = [];
		script(new Error("timeout"), new Error("timeout"));
		assert.deepEqual(await request(), { ok: false, reason: "network" });
		assert.equal(calls.length, 2);
	});

	test("успешный обмен не повторяется", async () => {
		script(json(400, { error: "invalid_grant" }));
		await request();
		assert.equal(calls.length, 1);
	});

	test("invalid_grant (повтор callback) различается отдельно и не логируется", async () => {
		script(
			json(400, {
				error: "invalid_grant",
				error_description: "Code has expired",
			}),
		);
		assert.deepEqual(await request(), { ok: false, reason: "invalid_grant" });
		assert.equal(warnings.length, 0);
	});

	test("прочие ошибки обмена — bad_response, в лог только стадия, статус и код", async () => {
		script(json(401, { error: "invalid_client", error_description: "secret" }));
		assert.deepEqual(await request(), { ok: false, reason: "bad_response" });
		assert.deepEqual(warnings, [
			[
				"[auth/oauth] Яндекс ID ответил ошибкой",
				{ stage: "token", status: 401, code: "invalid_client" },
			],
		]);

		warnings = [];
		script(new Response("<html>bad gateway</html>", { status: 502 }));
		assert.deepEqual(await request(), { ok: false, reason: "bad_response" });
		assert.deepEqual(warnings[0][1], {
			stage: "token",
			status: 502,
			code: undefined,
		});
	});

	test("токен без access_token — bad_response, /info не зовётся", async () => {
		script(json(200, { token_type: "bearer" }));
		assert.deepEqual(await request(), { ok: false, reason: "bad_response" });
		assert.equal(calls.length, 1);
		assert.deepEqual(warnings[0][1], {
			stage: "token",
			status: 200,
			code: "malformed",
		});

		calls = [];
		script(json(200, { access_token: "" }));
		assert.deepEqual(await request(), { ok: false, reason: "bad_response" });
		assert.equal(calls.length, 1);
	});

	test("/info: сеть, ошибка, мусор — без профиля", async () => {
		script(token(), new Error("ECONNRESET"));
		assert.deepEqual(await request(), { ok: false, reason: "network" });

		warnings = [];
		script(token(), json(401, {}));
		assert.deepEqual(await request(), { ok: false, reason: "bad_response" });
		assert.deepEqual(warnings[0][1], {
			stage: "info",
			status: 401,
			code: undefined,
		});

		warnings = [];
		script(token(), json(200, { default_email: "a@ya.ru" }));
		assert.deepEqual(await request(), { ok: false, reason: "bad_response" });
		assert.deepEqual(warnings[0][1], {
			stage: "info",
			status: 200,
			code: "malformed",
		});

		script(token(), new Response("not json", { status: 200 }));
		assert.deepEqual(await request(), { ok: false, reason: "bad_response" });
	});
});

async function lastProfile() {
	const result = await request();
	assert.equal(result.ok, true);
	if (!result.ok) throw new Error("unreachable");
	return result.profile;
}
