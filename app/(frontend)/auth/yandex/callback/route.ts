import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { completeLogin } from "@/modules/auth/lib/completeLogin";
import {
	isAccountAccessDeniedError,
	logUnexpectedAuthError,
} from "@/modules/auth/lib/errorHandling";
import { getCurrentUser } from "@/modules/auth/lib/getCurrentUser";
import { RATE_LIMITS } from "@/modules/auth/lib/rateLimit";
import { parseDeviceLabel } from "@/modules/auth/lib/session";
import { getRequestMeta } from "@/modules/auth/lib/utils";
import { getYandexConfig } from "@/modules/auth/oauth/config";
import { startConfirmationByCode } from "@/modules/auth/oauth/confirmByCode";
import {
	consumeFlow,
	savePendingLink,
	savePendingSignup,
} from "@/modules/auth/oauth/flowStore";
import { touchIdentity } from "@/modules/auth/oauth/identities";
import { issueSessionWithoutPassword } from "@/modules/auth/oauth/issueSession";
import { sameOpaqueValue } from "@/modules/auth/oauth/pkce";
import { resolveOAuthProfile } from "@/modules/auth/oauth/resolve";
import type { OAuthErrorCode } from "@/modules/auth/oauth/types";
import { fetchYandexProfile } from "@/modules/auth/oauth/yandex";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notify } from "@/services/notifications/notificationCenter";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL = "Яндекс ID";

/**
 * Возврат с oauth.yandex.ru: проверка state, обмен кода, развилка.
 *
 * Поток и решения — в src/modules/auth/oauth/CHECKLIST.md (разделы 1 и 8),
 * сама развилка — oauth/resolve.ts. Здесь — только последствия каждой ветки:
 *
 *   login          → сессия сразу (completeLogin), на `next`
 *   linked         → привязка из кабинета уже создана, обратно в кабинет
 *   link_required  → токен прячется в pending-auth, код на почту аккаунта,
 *                    экран /auth/verify-otp; привязку создаст verifyOtpAction
 *   signup         → черновик в Redis, форма «имя + согласия»
 *
 * Ни одна ошибка не показывает пользователю подробностей и не попадает в
 * адресную строку иначе как кодом из OAuthErrorCode.
 */
export async function GET(request: Request) {
	const config = await getYandexConfig();
	if (!config) return new NextResponse(null, { status: 404 });

	const redirectTo = (path: string) =>
		NextResponse.redirect(new URL(path, config.origin));

	// Состояние забираем ПЕРВЫМ и в любом случае: даже неудачный возврат
	// сжигает его, повторить этот же callback нельзя.
	const flow = await consumeFlow();

	const fail = (code: OAuthErrorCode) =>
		flow?.intent === "link"
			? redirectTo(`/profile?tab=security&oauth_error=${code}`)
			: redirectTo(`/auth/login?oauth_error=${code}`);

	const { ip, userAgent } = await getRequestMeta();
	const rl = await RATE_LIMITS.oauth(ip);
	if (!rl.allowed) return fail("rate_limited");

	if (!flow) return fail("expired");

	const params = new URL(request.url).searchParams;
	const providerError = params.get("error");
	if (providerError) {
		// access_denied — пользователь нажал «Отмена» на экране Яндекса.
		return fail(
			providerError === "access_denied" ? "cancelled" : "unavailable",
		);
	}

	const state = params.get("state");
	const code = params.get("code");
	if (!state || !sameOpaqueValue(state, flow.state)) return fail("expired");
	if (!code) return fail("generic");

	// Привязка из кабинета: вернуться обязан тот же вошедший покупатель, что
	// начал её. Иначе ссылку на callback с чужим кодом можно было бы
	// подсунуть жертве и привязать к ЕЁ кабинету свой Яндекс.
	if (flow.intent === "link") {
		const current = await getCurrentUser();
		if (!current || String(current.id) !== flow.linkUserId) {
			return fail("expired");
		}
	}

	const result = await fetchYandexProfile({
		code,
		codeVerifier: flow.codeVerifier,
		redirectUri: config.redirectUri,
		credentials: {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
		},
	});
	if (!result.ok) {
		return fail(result.reason === "invalid_grant" ? "expired" : "unavailable");
	}

	try {
		const payload = await getPayloadInstance();
		const resolution = await resolveOAuthProfile(payload, {
			provider: flow.provider,
			profile: result.profile,
			intent: flow.intent,
			linkUserId: flow.linkUserId,
		});

		switch (resolution.kind) {
			case "error":
				return fail(resolution.code);

			case "consent_required": {
				// Привязка из кабинета к аккаунту со старой редакцией Согласия:
				// сначала экран согласия (linkConsent.ts), привязка — после него.
				await savePendingLink({
					userId: String(resolution.userId),
					provider: flow.provider,
					subject: result.profile.subject,
					email: result.profile.email,
					next: flow.next,
				});
				return redirectTo("/auth/yandex/link");
			}

			case "linked": {
				if (resolution.created) {
					void notify(payload, resolution.userId, "oauth_linked", {
						providerLabel: PROVIDER_LABEL,
					});
				}
				revalidatePath("/profile");
				return redirectTo(flow.next);
			}

			case "login": {
				const { token } = await issueSessionWithoutPassword(
					payload,
					resolution.userId,
				);
				await completeLogin({
					payload,
					userId: String(resolution.userId),
					token,
					ip,
					userAgent,
				});
				void touchIdentity(payload, resolution.identityId).catch((err) =>
					logUnexpectedAuthError("oauth.touchIdentity", err),
				);
				void notify(payload, resolution.userId, "login_oauth", {
					providerLabel: PROVIDER_LABEL,
					deviceLabel: parseDeviceLabel(userAgent),
					ip,
				});
				revalidatePath("/", "layout");
				return redirectTo(flow.next);
			}

			case "link_required": {
				const started = await startConfirmationByCode(payload, {
					userId: resolution.userId,
					type: "link_oauth",
					oauthLink: {
						provider: flow.provider,
						subject: result.profile.subject,
						email: result.profile.email ?? resolution.email,
					},
					redirectTo: flow.next,
					ip,
					userAgent,
				});
				return started ? redirectTo("/auth/verify-otp") : fail("generic");
			}

			case "signup": {
				await savePendingSignup({
					provider: flow.provider,
					subject: result.profile.subject,
					email: resolution.email,
					name: resolution.name,
					emailTrusted: resolution.emailTrusted,
					next: flow.next,
					ip,
					userAgent,
				});
				return redirectTo("/auth/yandex/complete");
			}
		}
	} catch (err) {
		if (isAccountAccessDeniedError(err)) {
			return fail(
				(err as Error).name === "AccountSuspendedError"
					? "account_suspended"
					: "account_blocked",
			);
		}
		logUnexpectedAuthError("oauth.callback", err);
		return fail("generic");
	}
}
