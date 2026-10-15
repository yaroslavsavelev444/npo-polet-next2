/**
 * Локальная замена oauth.yandex.ru и login.yandex.ru для E2E и ручной проверки
 * входа через Яндекс ID (src/modules/auth/oauth).
 *
 *   node tests/e2e/mock-yandex.mjs            # порт 4610 (MOCK_YANDEX_PORT)
 *
 * Витрина направляется сюда переменными YANDEX_OAUTH_URL и YANDEX_LOGIN_URL
 * (src/env.ts); ключи приложения — mock-client / mock-secret
 * (MOCK_YANDEX_CLIENT_ID / MOCK_YANDEX_CLIENT_SECRET).
 *
 * Мок не подыгрывает: проверяет всё, что проверяет настоящий Яндекс и что
 * могло бы сломаться у нас, —
 *   • client_id и redirect_uri в /authorize, client_id:client_secret (Basic)
 *     и совпадение redirect_uri в /token;
 *   • PKCE S256: sha256(code_verifier) обязан совпасть с code_challenge;
 *   • код одноразовый и живёт 10 минут; повтор → invalid_grant;
 *   • /info — только с заголовком `Authorization: OAuth <token>`.
 *
 * /authorize показывает страницу «согласия» с полями профиля — какой аккаунт
 * Яндекса «войдёт», выбирает человек или тест: поля id, email, first_name,
 * last_name и кнопки «Разрешить» / «Отмена» (access_denied). Пустой email —
 * аккаунт Яндекса без почты.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_YANDEX_PORT ?? 4610);
const CLIENT_ID = process.env.MOCK_YANDEX_CLIENT_ID ?? "mock-client";
const CLIENT_SECRET = process.env.MOCK_YANDEX_CLIENT_SECRET ?? "mock-secret";
const CODE_TTL_MS = 10 * 60 * 1000;

/** code → { challenge, redirectUri, profile, expiresAt } */
const codes = new Map();
/** access_token → profile */
const tokens = new Map();

const escape = (v) =>
	String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function json(res, status, body) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}

function readBody(req) {
	return new Promise((resolve) => {
		let data = "";
		req.on("data", (chunk) => {
			data += chunk;
		});
		req.on("end", () => resolve(data));
	});
}

function consentPage(params) {
	const hidden = [
		"client_id",
		"redirect_uri",
		"state",
		"code_challenge",
		"code_challenge_method",
		"scope",
	]
		.map(
			(k) =>
				`<input type="hidden" name="${k}" value="${escape(params.get(k))}">`,
		)
		.join("");
	return `<!doctype html><html lang="ru"><meta charset="utf-8">
<title>Mock Яндекс ID</title>
<style>body{font:16px system-ui;max-width:420px;margin:40px auto;padding:0 16px}
label{display:block;margin:10px 0}input[type=text]{width:100%;padding:8px;box-sizing:border-box}
button{padding:10px 16px;margin-right:8px}</style>
<h1>Mock Яндекс ID</h1>
<p>Приложение <b>${escape(params.get("client_id"))}</b> просит доступ: ${escape(params.get("scope"))}</p>
<form method="post" action="/authorize/decide">${hidden}
<label>id <input type="text" name="id" value="${Date.now()}"></label>
<label>email <input type="text" name="email" value="mock.user@yandex.ru"></label>
<label>first_name <input type="text" name="first_name" value="Иван"></label>
<label>last_name <input type="text" name="last_name" value="Петров"></label>
<button name="decision" value="allow">Разрешить</button>
<button name="decision" value="deny">Отмена</button>
</form></html>`;
}

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

	// ── GET /authorize — проверка параметров и страница согласия ────────────
	if (req.method === "GET" && url.pathname === "/authorize") {
		const p = url.searchParams;
		if (p.get("client_id") !== CLIENT_ID) {
			res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
			return res.end("mock: неизвестный client_id");
		}
		if (
			p.get("response_type") !== "code" ||
			p.get("code_challenge_method") !== "S256" ||
			!p.get("code_challenge")
		) {
			res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
			return res.end("mock: нужны response_type=code и PKCE S256");
		}
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
		return res.end(consentPage(p));
	}

	// ── POST /authorize/decide — «Разрешить» / «Отмена» ─────────────────────
	if (req.method === "POST" && url.pathname === "/authorize/decide") {
		const form = new URLSearchParams(await readBody(req));
		const back = new URL(form.get("redirect_uri"));
		if (form.get("state")) back.searchParams.set("state", form.get("state"));
		if (form.get("decision") !== "allow") {
			back.searchParams.set("error", "access_denied");
			back.searchParams.set("error_description", "user denied");
		} else {
			const code = String(1000000 + Math.floor(Math.random() * 8999999));
			const email = form.get("email")?.trim();
			codes.set(code, {
				challenge: form.get("code_challenge"),
				redirectUri: form.get("redirect_uri"),
				expiresAt: Date.now() + CODE_TTL_MS,
				profile: {
					id: form.get("id"),
					login: "mock-login",
					client_id: CLIENT_ID,
					psuid: `psuid-${form.get("id")}`,
					...(email ? { default_email: email, emails: [email] } : {}),
					first_name: form.get("first_name") || undefined,
					last_name: form.get("last_name") || undefined,
					display_name: "mock",
					real_name:
						`${form.get("first_name") ?? ""} ${form.get("last_name") ?? ""}`.trim(),
					sex: "male",
				},
			});
			back.searchParams.set("code", code);
		}
		res.writeHead(302, { Location: back.toString() });
		return res.end();
	}

	// ── POST /token — обмен кода ────────────────────────────────────────────
	if (req.method === "POST" && url.pathname === "/token") {
		const expected = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`;
		if (req.headers.authorization !== expected) {
			return json(res, 401, {
				error: "invalid_client",
				error_description: "mock: неверный Basic",
			});
		}
		const form = new URLSearchParams(await readBody(req));
		if (form.get("grant_type") !== "authorization_code") {
			return json(res, 400, { error: "unsupported_grant_type" });
		}
		const entry = codes.get(form.get("code"));
		codes.delete(form.get("code"));
		if (!entry || entry.expiresAt < Date.now()) {
			return json(res, 400, {
				error: "invalid_grant",
				error_description: "Code has expired",
			});
		}
		if (
			form.get("redirect_uri") &&
			form.get("redirect_uri") !== entry.redirectUri
		) {
			return json(res, 400, {
				error: "invalid_grant",
				error_description: "mock: redirect_uri",
			});
		}
		const challenge = createHash("sha256")
			.update(form.get("code_verifier") ?? "")
			.digest("base64url");
		if (challenge !== entry.challenge) {
			return json(res, 400, {
				error: "invalid_grant",
				error_description: "mock: PKCE",
			});
		}
		const accessToken = randomBytes(24).toString("hex");
		tokens.set(accessToken, entry.profile);
		return json(res, 200, {
			token_type: "bearer",
			access_token: accessToken,
			refresh_token: randomBytes(24).toString("hex"),
			expires_in: 31536000,
		});
	}

	// ── GET /info — профиль ────────────────────────────────────────────────
	if (req.method === "GET" && url.pathname === "/info") {
		const auth = req.headers.authorization ?? "";
		const profile = auth.startsWith("OAuth ")
			? tokens.get(auth.slice(6))
			: undefined;
		if (!profile) {
			res.writeHead(401);
			return res.end();
		}
		return json(res, 200, profile);
	}

	res.writeHead(404);
	res.end();
});

server.listen(PORT, () => {
	console.log(`mock-yandex: http://localhost:${PORT}`);
});
