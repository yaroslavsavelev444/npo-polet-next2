import { resolveSafeRedirect } from "../lib/safeRedirect";

/**
 * Куда вернуть покупателя после входа через Яндекс ID. Те же правила, что у
 * ?from= в proxy.ts: только свой origin и не страницы самого входа — иначе
 * открытый редирект или петля.
 */
const AUTH_PATH_PREFIXES = [
	"/auth/login",
	"/auth/register",
	"/auth/forgot-password",
	"/auth/password-reset",
	"/auth/verify-otp",
	"/auth/yandex",
];

export function resolveOAuthReturnPath(
	from: string | null | undefined,
	{ origin, fallback }: { origin: string; fallback: string },
): string {
	return resolveSafeRedirect(from, {
		origin,
		fallback,
		isDisallowedTarget: (pathname) =>
			AUTH_PATH_PREFIXES.some(
				(p) => pathname === p || pathname.startsWith(`${p}/`),
			),
	});
}
