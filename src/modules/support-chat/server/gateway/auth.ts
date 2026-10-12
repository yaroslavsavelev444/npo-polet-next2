import type { IncomingHttpHeaders } from "node:http";
import type { Payload } from "payload";
import type { Admin, User } from "@/payload-types";
import {
	customerActorFromUser,
	type SupportActor,
	staffActorFromAdmin,
} from "../permissions.ts";

/**
 * Проверка источника рукопожатия — защита от cross-site WebSocket hijacking.
 *
 * Cookie сессии браузер прикладывает к соединению с нашим хостом, с какой бы
 * страницы оно ни открывалось. Без этой проверки чужой сайт, открытый у
 * вошедшего покупателя, подключился бы к шлюзу от его имени и читал бы
 * переписку. CORS здесь не защищает: на WebSocket он не распространяется.
 *
 * Порядок источников:
 *  • Origin — есть у любого WebSocket-рукопожатия и у кросс-доменных
 *    запросов; если есть, решает только он.
 *  • Sec-Fetch-Site — у same-origin GET (транспорт long-polling) браузер
 *    Origin не шлёт, зато шлёт этот заголовок; подделать его страница не может.
 *  • Referer — запасной путь для браузеров без Sec-Fetch-*.
 * Нет ни одного — отказ: браузерный клиент без них не бывает.
 */
export function isAllowedHandshakeSource(
	headers: IncomingHttpHeaders,
	allowedOrigins: readonly string[],
): boolean {
	const origin = headers.origin;
	if (origin) return allowedOrigins.includes(origin);

	const fetchSite = headers["sec-fetch-site"];
	if (typeof fetchSite === "string") return fetchSite === "same-origin";

	const referer = headers.referer;
	if (referer) {
		try {
			return allowedOrigins.includes(new URL(referer).origin);
		} catch {
			return false;
		}
	}
	return false;
}

/** Заголовки рукопожатия, нужные для повторной проверки сессии. */
export interface AuthHeaders {
	cookie?: string;
	origin?: string;
	/**
	 * Без Origin (same-origin GET, транспорт polling) Payload принимает cookie
	 * только по Sec-Fetch-Site (payload/dist/auth/extractJWT.js) — без этого
	 * заголовка такой запрос выглядел бы неавторизованным.
	 */
	secFetchSite?: string;
}

export function pickAuthHeaders(headers: IncomingHttpHeaders): AuthHeaders {
	return {
		cookie: typeof headers.cookie === "string" ? headers.cookie : undefined,
		origin: typeof headers.origin === "string" ? headers.origin : undefined,
		secFetchSite:
			typeof headers["sec-fetch-site"] === "string"
				? headers["sec-fetch-site"]
				: undefined,
	};
}

/**
 * Участник по cookie сессии Payload. Те же правила, что у витрины и админки:
 * токен Payload (с проверкой сессии по sid), активный покупатель или
 * менеджер чата. Всё прочее — null.
 *
 * Origin передаётся дальше намеренно: Payload сверяет его со списком csrf и
 * при постороннем Origin cookie не принимает — второй рубеж к проверке выше.
 */
export async function authenticate(
	payload: Payload,
	authHeaders: AuthHeaders,
): Promise<SupportActor | null> {
	if (!authHeaders.cookie) return null;

	const headers = new Headers();
	headers.set("cookie", authHeaders.cookie);
	if (authHeaders.origin) headers.set("origin", authHeaders.origin);
	if (authHeaders.secFetchSite)
		headers.set("sec-fetch-site", authHeaders.secFetchSite);

	let user: Admin | User | null;
	try {
		user = (await payload.auth({ headers })).user as Admin | User | null;
	} catch {
		return null;
	}
	if (!user) return null;

	if (user.collection === "users") return customerActorFromUser(user as User);
	if (user.collection === "admins") return staffActorFromAdmin(user as Admin);
	return null;
}

/** Тот же ли это участник: повторная проверка не должна «сменить» человека. */
export function sameActor(a: SupportActor, b: SupportActor): boolean {
	if (a.kind === "customer" && b.kind === "customer")
		return a.userId === b.userId;
	if (a.kind === "staff" && b.kind === "staff") return a.adminId === b.adminId;
	return false;
}

/**
 * IP клиента за nginx. Как в modules/auth/lib/utils.ts: X-Real-IP выставляет
 * наш nginx; первый элемент X-Forwarded-For присылает сам клиент и может
 * быть любым, поэтому из XFF берётся только последний (дописанный nginx).
 */
export function clientIp(
	headers: IncomingHttpHeaders,
	fallback: string,
): string {
	const realIp = headers["x-real-ip"];
	const real = (Array.isArray(realIp) ? realIp[0] : realIp)?.trim();
	if (real) return real;
	const forwarded = headers["x-forwarded-for"];
	const list = (
		Array.isArray(forwarded) ? forwarded.join(",") : (forwarded ?? "")
	)
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	return list.at(-1) || fallback;
}
