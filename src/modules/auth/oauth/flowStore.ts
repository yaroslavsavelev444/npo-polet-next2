import { cookies } from "next/headers";
import { redis } from "../lib/redis";
import { createOpaqueId } from "./pkce";
import type { OAuthProviderId } from "./types";

/**
 * Короткоживущие состояния входа через внешний сервис — в Redis, у браузера
 * только непредсказуемый идентификатор в httpOnly-cookie (как pending-auth).
 *
 * Два состояния с разными сроками и путями cookie:
 *
 *  • flow   — от нажатия кнопки до возврата с Яндекса: state, PKCE verifier,
 *             куда вернуть и зачем пришли. Одноразовое (GETDEL): повторный
 *             callback с тем же state ничего не найдёт. Cookie видна только
 *             /auth/yandex/* — больше она никому не нужна.
 *  • signup — от возврата с Яндекса до отправки формы «имя + согласия»:
 *             профиль Яндекса, который ещё не стал аккаунтом. Токенов здесь
 *             нет (их нет вообще, см. yandex.ts).
 *  • link   — привязка к существующему аккаунту, личность уже подтверждена
 *             (сессия или код), ждём только согласия действующей редакции
 *             (linkConsent.ts, экран /auth/yandex/link). Одноразовое.
 *
 * Все ключи — с TTL: у Redis проекта maxmemory-policy volatile-ttl, ключ без
 * срока не вытесняется никогда.
 */

const FLOW_TTL_MS = 10 * 60 * 1000;
/** Заполнить форму из двух полей и прочитать документы — с запасом. */
const SIGNUP_TTL_MS = 30 * 60 * 1000;

export const OAUTH_FLOW_COOKIE = "oauth-flow";
export const OAUTH_SIGNUP_COOKIE = "oauth-signup";
export const OAUTH_LINK_COOKIE = "oauth-link";

const flowKey = (id: string) => `oauth-flow:${id}`;
const signupKey = (id: string) => `oauth-signup:${id}`;
const linkKey = (id: string) => `oauth-link:${id}`;

const secure = process.env.NODE_ENV === "production";

export interface OAuthFlow {
	provider: OAuthProviderId;
	state: string;
	codeVerifier: string;
	/** Уже проверенный resolveSafeRedirect путь, куда вернуть после входа. */
	next: string;
	/**
	 * login — вход/регистрация гостя;
	 * link  — привязка из кабинета уже вошедшим покупателем (linkUserId).
	 *         Сверяется в callback с текущей сессией: так нельзя «подсунуть»
	 *         свой Яндекс в чужой кабинет, отправив жертве ссылку на callback.
	 */
	intent: "login" | "link";
	linkUserId?: string;
}

export async function startFlow(
	data: Omit<OAuthFlow, "state" | "codeVerifier"> & {
		state: string;
		codeVerifier: string;
	},
): Promise<void> {
	const id = createOpaqueId();
	await redis.set(flowKey(id), JSON.stringify(data), "PX", FLOW_TTL_MS);
	(await cookies()).set(OAUTH_FLOW_COOKIE, id, {
		httpOnly: true,
		secure,
		// lax, не strict: возврат с oauth.yandex.ru — межсайтовая навигация
		// верхнего уровня, и strict-cookie на неё просто не пришла бы.
		sameSite: "lax",
		path: "/auth/yandex",
		maxAge: Math.floor(FLOW_TTL_MS / 1000),
	});
}

/** Достаёт и сразу уничтожает состояние потока. null — нет, истекло или уже использовано. */
export async function consumeFlow(): Promise<OAuthFlow | null> {
	const cookieStore = await cookies();
	const id = cookieStore.get(OAUTH_FLOW_COOKIE)?.value;
	cookieStore.delete({ name: OAUTH_FLOW_COOKIE, path: "/auth/yandex" });
	if (!id) return null;

	const raw = await redis.getdel(flowKey(id));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as OAuthFlow;
	} catch {
		return null;
	}
}

export interface PendingSignup {
	provider: OAuthProviderId;
	subject: string;
	email: string;
	name: string;
	/**
	 * Владение почтой доказано самим сервисом (ящик на домене Яндекса). Иначе
	 * после формы почта подтверждается нашим кодом.
	 */
	emailTrusted: boolean;
	next: string;
	ip: string;
	userAgent: string;
}

export async function savePendingSignup(data: PendingSignup): Promise<void> {
	const id = createOpaqueId();
	await redis.set(signupKey(id), JSON.stringify(data), "PX", SIGNUP_TTL_MS);
	(await cookies()).set(OAUTH_SIGNUP_COOKIE, id, {
		httpOnly: true,
		secure,
		sameSite: "lax",
		path: "/",
		maxAge: Math.floor(SIGNUP_TTL_MS / 1000),
	});
}

export async function readPendingSignup(): Promise<PendingSignup | null> {
	const id = (await cookies()).get(OAUTH_SIGNUP_COOKIE)?.value;
	if (!id) return null;
	const raw = await redis.get(signupKey(id));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as PendingSignup;
	} catch {
		return null;
	}
}

/**
 * Одноразово забирает черновик регистрации: две параллельные отправки формы
 * не заведут два аккаунта — вторая ничего не найдёт.
 */
export async function consumePendingSignup(): Promise<PendingSignup | null> {
	const cookieStore = await cookies();
	const id = cookieStore.get(OAUTH_SIGNUP_COOKIE)?.value;
	if (!id) return null;
	const raw = await redis.getdel(signupKey(id));
	cookieStore.delete(OAUTH_SIGNUP_COOKIE);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as PendingSignup;
	} catch {
		return null;
	}
}

export interface PendingLink {
	/** Аккаунт, к которому привязываем: сверяется с сессией на экране согласия. */
	userId: string;
	provider: OAuthProviderId;
	subject: string;
	email: string | null;
	/** Уже проверенный путь, куда вернуть после привязки. */
	next: string;
}

export async function savePendingLink(data: PendingLink): Promise<void> {
	const id = createOpaqueId();
	// Тот же срок, что у черновика регистрации: прочитать документ и решить.
	await redis.set(linkKey(id), JSON.stringify(data), "PX", SIGNUP_TTL_MS);
	(await cookies()).set(OAUTH_LINK_COOKIE, id, {
		httpOnly: true,
		secure,
		sameSite: "lax",
		path: "/auth/yandex",
		maxAge: Math.floor(SIGNUP_TTL_MS / 1000),
	});
}

export async function readPendingLink(): Promise<PendingLink | null> {
	const id = (await cookies()).get(OAUTH_LINK_COOKIE)?.value;
	if (!id) return null;
	const raw = await redis.get(linkKey(id));
	if (!raw) return null;
	try {
		return JSON.parse(raw) as PendingLink;
	} catch {
		return null;
	}
}

/** Одноразово: повторная отправка формы согласия ничего не найдёт. */
export async function consumePendingLink(): Promise<PendingLink | null> {
	const cookieStore = await cookies();
	const id = cookieStore.get(OAUTH_LINK_COOKIE)?.value;
	if (!id) return null;
	const raw = await redis.getdel(linkKey(id));
	cookieStore.delete({ name: OAUTH_LINK_COOKIE, path: "/auth/yandex" });
	if (!raw) return null;
	try {
		return JSON.parse(raw) as PendingLink;
	} catch {
		return null;
	}
}
