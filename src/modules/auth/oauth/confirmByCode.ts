import type { BasePayload } from "payload";
import { notifyOtpCode } from "@/services/notifications/notifyOtpCode";
import { logUnexpectedAuthError, safeCreateOtp } from "../lib/errorHandling";
import { createPendingAuth } from "../lib/pendingAuth";
import { issueSessionWithoutPassword } from "./issueSession";
import type { PendingOAuthLink } from "./types";

/**
 * Вход через Яндекс ID, который завершится только кодом с почты аккаунта:
 *
 *  • link_oauth   — почта Яндекса совпала с уже существующим аккаунтом;
 *  • email_verify — новый аккаунт с почтой не на домене Яндекса (Яндекс не
 *                   сообщает, подтверждён ли такой адрес).
 *
 * Дальше — обычный экран /auth/verify-otp со всеми его защитами (лимиты,
 * повторная отправка); привязку создаёт verifyOtpAction по `oauthLink`.
 * Токен выдаётся сейчас, но браузер получит его только после кода — как и
 * токен из payload.login() на обычном входе.
 *
 * @returns false — код создать не удалось, продолжать нечем.
 */
export async function startConfirmationByCode(
	payload: BasePayload,
	params: {
		userId: number | string;
		type: "link_oauth" | "email_verify";
		oauthLink: PendingOAuthLink;
		redirectTo: string;
		ip: string;
		userAgent: string;
	},
): Promise<boolean> {
	const { token, email, name } = await issueSessionWithoutPassword(
		payload,
		params.userId,
	);

	const otp = await safeCreateOtp(
		payload,
		{ userId: String(params.userId), type: params.type, ip: params.ip },
		`oauth.${params.type}.createOtp`,
	);
	if (!otp) return false;

	await createPendingAuth({
		userId: String(params.userId),
		email,
		name,
		type: params.type,
		token,
		ip: params.ip,
		userAgent: params.userAgent,
		oauthLink: params.oauthLink,
		redirectTo: params.redirectTo,
	});

	// Сбой письма не обрывает поток: на экране кода есть «отправить повторно»
	// (как в registerAction).
	try {
		await notifyOtpCode({ to: email, code: otp, purpose: params.type });
	} catch (err) {
		logUnexpectedAuthError(`oauth.${params.type}.notifyOtpCode`, err);
	}
	return true;
}
