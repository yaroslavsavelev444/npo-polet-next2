import { z } from "zod";

/**
 * Клиент Яндекс ID: адрес авторизации, обмен кода на токен, профиль.
 *
 * Документация: https://yandex.ru/dev/id/doc/ru/codes/code-url и
 * https://yandex.ru/dev/id/doc/ru/user-information (сверено 13.10.2026).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ТОКЕН ЖИВЁТ ОДНУ ФУНКЦИЮ
 * ────────────────────────────────────────────────────────────────────────────
 * fetchYandexProfile получает код и возвращает профиль; access_token
 * существует только внутри неё и наружу не выходит — ни в Redis, ни в базу,
 * ни в логи. refresh_token Яндекс присылает всегда — он просто отбрасывается.
 * Доступ к Яндексу после входа нам не нужен.
 *
 * Ничего из ответа Яндекса не логируется: в ошибках — только HTTP-статус и
 * код ошибки OAuth (`invalid_grant` и т.п.), которые не содержат данных.
 */

const DEFAULT_OAUTH_URL = "https://oauth.yandex.ru";
const DEFAULT_LOGIN_URL = "https://login.yandex.ru";
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Запрашиваемые права. Телефон, дату рождения и портрет не просим (решение
 * владельца 13.10.2026, минимизация ПД). `login:info` вместе с именем отдаёт
 * пол — он отбрасывается схемой профиля ниже и нигде не сохраняется.
 */
export const YANDEX_SCOPES = ["login:email", "login:info"] as const;

/**
 * Домены почты, которыми владеет сам Яндекс. Адрес на них — это почтовый ящик
 * той же учётной записи, и владение им доказано входом в Яндекс. Для прочих
 * адресов Яндекс не сообщает, подтверждены ли они, поэтому такие адреса мы
 * подтверждаем своим кодом (см. resolve.ts).
 */
const YANDEX_MAIL_DOMAINS = new Set([
	"yandex.ru",
	"ya.ru",
	"yandex.com",
	"yandex.by",
	"yandex.kz",
	"yandex.ua",
	"yandex.com.tr",
	"narod.ru",
]);

export function isYandexOwnedEmail(email: string): boolean {
	const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
	return YANDEX_MAIL_DOMAINS.has(domain);
}

export function yandexOAuthBaseUrl(): string {
	return process.env.YANDEX_OAUTH_URL?.trim() || DEFAULT_OAUTH_URL;
}

function yandexLoginBaseUrl(): string {
	return process.env.YANDEX_LOGIN_URL?.trim() || DEFAULT_LOGIN_URL;
}

export interface YandexCredentials {
	clientId: string;
	clientSecret: string;
}

export function buildYandexAuthorizeUrl(params: {
	clientId: string;
	redirectUri: string;
	state: string;
	codeChallenge: string;
}): string {
	const url = new URL("/authorize", yandexOAuthBaseUrl());
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("state", params.state);
	url.searchParams.set("scope", YANDEX_SCOPES.join(" "));
	url.searchParams.set("code_challenge", params.codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	// force_confirm не ставим: иначе экран выбора аккаунта и согласия
	// показывался бы при каждом входе, а не только при первом.
	return url.toString();
}

/** Профиль ровно в том объёме, который мы готовы хранить. */
export interface YandexProfile {
	/** Постоянный идентификатор пользователя Яндекса — ключ привязки. */
	subject: string;
	/** Нормализованная почта (trim + lower) или null, если у аккаунта её нет. */
	email: string | null;
	/** Имя для формы регистрации; пустая строка, если Яндекс ничего не дал. */
	name: string;
}

export type YandexProfileResult =
	| { ok: true; profile: YandexProfile }
	| {
			ok: false;
			/** invalid_grant — код просрочен или уже использован (повтор callback). */
			reason: "invalid_grant" | "network" | "bad_response";
	  };

const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
});

const tokenErrorSchema = z.object({ error: z.string() });

// Только нужные поля; всё остальное (пол, логин, client_id…) отбрасывается.
const infoResponseSchema = z.object({
	id: z.union([z.string(), z.number()]).transform(String),
	default_email: z.string().optional().nullable(),
	emails: z.array(z.string()).optional().nullable(),
	first_name: z.string().optional().nullable(),
	last_name: z.string().optional().nullable(),
	real_name: z.string().optional().nullable(),
	display_name: z.string().optional().nullable(),
});

function normalizeEmail(raw: string | null | undefined): string | null {
	const value = raw?.trim().toLowerCase();
	if (!value) return null;
	// Тот же минимум, что и у формы регистрации: адрес, который нельзя
	// использовать для писем о заказе, лучше считать отсутствующим.
	return z.string().email().safeParse(value).success ? value : null;
}

function pickName(info: z.infer<typeof infoResponseSchema>): string {
	const full = [info.first_name, info.last_name]
		.map((p) => p?.trim())
		.filter(Boolean)
		.join(" ");
	return (
		full ||
		info.real_name?.trim() ||
		info.display_name?.trim() ||
		""
	).slice(0, 100);
}

async function postForm(
	url: string,
	body: URLSearchParams,
	authorization: string,
): Promise<Response> {
	return fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: authorization,
		},
		body,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		cache: "no-store",
	});
}

/**
 * Код из callback → профиль. Один повтор только на сетевую ошибку обмена:
 * код одноразовый, и если первый запрос дошёл до Яндекса, второй получит
 * invalid_grant — это честный ответ «войдите снова».
 */
export async function fetchYandexProfile(params: {
	code: string;
	codeVerifier: string;
	redirectUri: string;
	credentials: YandexCredentials;
}): Promise<YandexProfileResult> {
	const tokenUrl = new URL("/token", yandexOAuthBaseUrl()).toString();
	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code: params.code,
		code_verifier: params.codeVerifier,
		redirect_uri: params.redirectUri,
	});
	const basic = `Basic ${Buffer.from(
		`${params.credentials.clientId}:${params.credentials.clientSecret}`,
	).toString("base64")}`;

	let tokenResponse: Response | undefined;
	for (let attempt = 0; attempt < 2 && !tokenResponse; attempt++) {
		try {
			tokenResponse = await postForm(tokenUrl, body, basic);
		} catch {
			// сеть/таймаут — одна повторная попытка
		}
	}
	if (!tokenResponse) return { ok: false, reason: "network" };

	const tokenJson: unknown = await tokenResponse.json().catch(() => null);
	if (!tokenResponse.ok) {
		const error = tokenErrorSchema.safeParse(tokenJson);
		if (error.success && error.data.error === "invalid_grant") {
			return { ok: false, reason: "invalid_grant" };
		}
		logYandexFailure(
			"token",
			tokenResponse.status,
			error.success ? error.data.error : undefined,
		);
		return { ok: false, reason: "bad_response" };
	}
	const token = tokenResponseSchema.safeParse(tokenJson);
	if (!token.success) {
		logYandexFailure("token", tokenResponse.status, "malformed");
		return { ok: false, reason: "bad_response" };
	}

	let infoResponse: Response;
	try {
		infoResponse = await fetch(
			new URL("/info?format=json", yandexLoginBaseUrl()).toString(),
			{
				headers: { Authorization: `OAuth ${token.data.access_token}` },
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				cache: "no-store",
			},
		);
	} catch {
		return { ok: false, reason: "network" };
	}
	if (!infoResponse.ok) {
		logYandexFailure("info", infoResponse.status);
		return { ok: false, reason: "bad_response" };
	}
	const info = infoResponseSchema.safeParse(
		await infoResponse.json().catch(() => null),
	);
	if (!info.success) {
		logYandexFailure("info", infoResponse.status, "malformed");
		return { ok: false, reason: "bad_response" };
	}

	return {
		ok: true,
		profile: {
			subject: info.data.id,
			email:
				normalizeEmail(info.data.default_email) ??
				normalizeEmail(info.data.emails?.[0]),
			name: pickName(info.data),
		},
	};
}

/** Только статус и код ошибки — без тела ответа и без токенов. */
function logYandexFailure(
	stage: "token" | "info",
	status: number,
	code?: string,
) {
	console.warn("[auth/oauth] Яндекс ID ответил ошибкой", {
		stage,
		status,
		code,
	});
}
