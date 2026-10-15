import type { BasePayload } from "payload";
import { findIdentity, linkIdentity } from "./identities";
import type { OAuthErrorCode, OAuthProviderId } from "./types";
import { isYandexOwnedEmail, type YandexProfile } from "./yandex";

/**
 * Развилка после возврата с Яндекса: что делать с этим профилем.
 *
 * Здесь только решение (и создание привязки на пути из кабинета, где решать
 * больше нечего). Сессии, cookie, письма и редиректы — в callback/route.ts.
 *
 *   привязка есть ─────────────────────────────── login
 *   пришли из кабинета ──── привязать к себе ──── linked | already_linked_elsewhere
 *   почты у аккаунта Яндекса нет ──────────────── no_email
 *   почта совпала с аккаунтом ──────────────────── link_required (код на почту)
 *   почта новая ────────────────────────────────── signup (форма «имя + согласия»)
 *
 * ГЛАВНОЕ ПРАВИЛО: совпадение почты НИКОГДА не даёт входа само по себе. Тот,
 * кто управляет Яндексом с этой почтой, не обязательно владелец нашего
 * аккаунта — сначала код на почту аккаунта, потом привязка.
 */

export type Resolution =
	| { kind: "login"; userId: number; identityId: number }
	| { kind: "linked"; userId: number; created: boolean }
	| { kind: "link_required"; userId: number; email: string; name: string }
	| {
			kind: "signup";
			email: string;
			name: string;
			/** Владение почтой доказано Яндексом — без нашего кода. */
			emailTrusted: boolean;
	  }
	| { kind: "error"; code: OAuthErrorCode };

export async function resolveOAuthProfile(
	payload: BasePayload,
	params: {
		provider: OAuthProviderId;
		profile: YandexProfile;
		intent: "login" | "link";
		/** Для intent=link — покупатель, начавший привязку (уже сверен с сессией). */
		linkUserId?: string;
	},
): Promise<Resolution> {
	const { provider, profile, intent } = params;

	if (intent === "link") {
		if (!params.linkUserId) return { kind: "error", code: "generic" };
		const result = await linkIdentity(payload, {
			userId: params.linkUserId,
			provider,
			subject: profile.subject,
			email: profile.email,
		});
		return result.ok
			? {
					kind: "linked",
					userId: result.identity.userId,
					created: result.created,
				}
			: { kind: "error", code: "already_linked_elsewhere" };
	}

	const identity = await findIdentity(payload, provider, profile.subject);
	if (identity) {
		return { kind: "login", userId: identity.userId, identityId: identity.id };
	}

	if (!profile.email) return { kind: "error", code: "no_email" };

	const { docs } = await payload.find({
		collection: "users",
		where: { email: { equals: profile.email } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const existing = docs[0];

	if (existing) {
		// Заблокированному код не шлём: войти он всё равно не сможет, а письмо
		// «подтвердите привязку» на заблокированный аккаунт только сбивает с толку.
		if (existing.status === "blocked") {
			return { kind: "error", code: "account_blocked" };
		}
		if (existing.status === "suspended") {
			return { kind: "error", code: "account_suspended" };
		}
		return {
			kind: "link_required",
			userId: Number(existing.id),
			email: existing.email,
			name: existing.name ?? "",
		};
	}

	return {
		kind: "signup",
		email: profile.email,
		name: profile.name,
		emailTrusted: isYandexOwnedEmail(profile.email),
	};
}
