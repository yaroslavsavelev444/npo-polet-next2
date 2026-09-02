"use server";

import { z } from "zod";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyOtpCode } from "@/services/notifications/notifyOtpCode";
import { safeCreateOtp } from "../lib/errorHandling";
import { readPendingAuth } from "../lib/pendingAuth";
import { RATE_LIMITS } from "../lib/rateLimit";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";

const resendSchema = z.object({
	type: z.enum(["login_2fa", "email_verify"]),
});

/**
 * Server Action: повторная отправка OTP.
 *
 * Пользователь в обоих сценариях ещё НЕ авторизован (payload-token выдаётся
 * только после подтверждения кода, см. verifyOtp.ts) — идентифицируем его по
 * pending-auth челленджу, который создали loginAction/registerAction.
 */
export async function resendOtpAction(_prevState: unknown, formData: FormData) {
	const parsed = resendSchema.safeParse({ type: formData.get("type") });
	if (!parsed.success) {
		return actionError("Некорректный тип кода");
	}

	const { type } = parsed.data;

	const pending = await readPendingAuth();
	if (!pending || pending.type !== type) {
		return actionError("Сессия подтверждения истекла. Войдите снова.");
	}

	// Rate limit по email — до ветки decoy, чтобы поведение (в т.ч. троттлинг)
	// не отличалось от обычного повторного запроса кода.
	const rl = await RATE_LIMITS.otpResend(pending.email);
	if (!rl.allowed) {
		return actionError(
			"Слишком много запросов. Подождите несколько минут.",
			undefined,
			"rate_limited",
		);
	}

	// Челлендж-обманка (см. registerAction): реального пользователя/OTP нет.
	// Возвращаем такой же success, как при настоящей отправке, но ничего не
	// создаём и не шлём — регистрация на существующий email остаётся
	// неотличимой от повтора.
	if (pending.decoy) {
		return actionSuccess({ message: "Код отправлен повторно" });
	}

	const payload = await getPayloadInstance();
	const { ip } = await getRequestMeta();

	const otp = await safeCreateOtp(
		payload,
		{ userId: pending.userId, type, ip },
		"resendOtp.createOtp",
	);
	if (!otp) {
		return actionError(
			"Не удалось отправить код. Попробуйте ещё раз через несколько минут.",
		);
	}

	// В отличие от login.ts/register.ts, здесь безопасно вернуть actionError:
	// это отдельное действие на уже отрисованном экране OTP (кнопка «отправить
	// код повторно»), а не форма, которая должна куда-то навигировать по
	// success — пользователь просто видит сообщение об ошибке и может нажать
	// кнопку ещё раз.
	try {
		await notifyOtpCode({ to: pending.email, code: otp, purpose: type });
	} catch {
		return actionError(
			"Не удалось отправить код. Попробуйте ещё раз через несколько минут.",
		);
	}

	return actionSuccess({ message: "Код отправлен повторно" });
}
