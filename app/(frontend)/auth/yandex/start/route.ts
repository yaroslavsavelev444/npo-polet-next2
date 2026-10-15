import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { getYandexConfig } from "@/modules/auth/oauth/config";
import { startFlow } from "@/modules/auth/oauth/flowStore";
import {
	codeChallengeFor,
	createCodeVerifier,
	createOpaqueId,
} from "@/modules/auth/oauth/pkce";
import { resolveOAuthReturnPath } from "@/modules/auth/oauth/returnPath";
import { buildYandexAuthorizeUrl } from "@/modules/auth/oauth/yandex";

export const dynamic = "force-dynamic";

/**
 * Начало входа через Яндекс ID: кнопка «Войти с Яндекс ID» — обычная ссылка
 * сюда (`?next=` — куда вернуть), привязка из кабинета — `?intent=link`.
 *
 * GET, а не POST: это навигация, у неё нет побочных эффектов, кроме
 * короткоживущего состояния в Redis, а ссылка работает без JavaScript.
 * Подделка этого запроса чужим сайтом ничего не даёт: state и verifier
 * останутся в браузере жертвы, а завершить вход может только он. Привязку
 * (intent=link) чужой сайт не начнёт вовсе: для перехода с него proxy.ts
 * оставляет запрос гостевым (CROSS_SITE_GUEST_PATHS), и getCurrentUser ниже
 * никого не найдёт.
 */
export async function GET(request: Request) {
	const config = await getYandexConfig();
	if (!config) return new NextResponse(null, { status: 404 });

	const loginUrl = (code: string) =>
		NextResponse.redirect(
			new URL(`/auth/login?oauth_error=${code}`, config.origin),
		);

	const { ip } = await getRequestMeta();
	const rl = await RATE_LIMITS.oauth(ip);
	if (!rl.allowed) return loginUrl("rate_limited");

	const params = new URL(request.url).searchParams;
	const intent = params.get("intent") === "link" ? "link" : "login";

	let linkUserId: string | undefined;
	if (intent === "link") {
		const user = await getCurrentUser();
		if (!user) {
			const url = new URL("/auth/login", config.origin);
			url.searchParams.set("from", "/profile");
			return NextResponse.redirect(url);
		}
		linkUserId = String(user.id);
	}

	const next = resolveOAuthReturnPath(params.get("next"), {
		origin: config.origin,
		fallback: intent === "link" ? "/profile?tab=security" : "/profile",
	});

	const state = createOpaqueId();
	const codeVerifier = createCodeVerifier();
	await startFlow({
		provider: "yandex",
		state,
		codeVerifier,
		next,
		intent,
		linkUserId,
	});

	return NextResponse.redirect(
		buildYandexAuthorizeUrl({
			clientId: config.clientId,
			redirectUri: config.redirectUri,
			state,
			codeChallenge: codeChallengeFor(codeVerifier),
		}),
	);
}
