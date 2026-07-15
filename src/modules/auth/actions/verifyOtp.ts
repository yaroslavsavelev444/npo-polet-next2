"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notify } from "@/services/notifications/notificationCenter";
import { notifyNewSessionLogin } from "@/services/notifications/notifyNewSessionLogin";
import { verifyOtpCode } from "../lib/OtpStore";
import { getActiveSession, parseDeviceLabel } from "../lib/session";
import { isUser } from "../lib/typeGuards";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";
import type { AuthErrorCode, OtpVerifyResult } from "../types";

const verifyOtpSchema = z.object({
	code: z
		.string()
		.length(6, "Код должен содержать 6 цифр")
		.regex(/^\d{6}$/, "Код должен содержать только цифры"),
	type: z.enum(["login_2fa", "email_verify"]),
});

/**
 * Server Action: верификация OTP-кода.
 *
 * Единый action для двух сценариев:
 * - email_verify (регистрация): пользователь уже залогинен через registerAction
 * - login_2fa (вход):          пользователь уже залогинен через loginAction
 *
 * В обоих случаях payload-token cookie уже установлен —
 * идентифицируем пользователя через payload.auth().
 */
export async function verifyOtpAction(_prevState: unknown, formData: FormData) {
	const parsed = verifyOtpSchema.safeParse({
		code: formData.get("code"),
		type: formData.get("type"),
	});

	if (!parsed.success) {
		return actionError("Некорректный код", parsed.error.flatten().fieldErrors);
	}

	const { code, type } = parsed.data;
	const cookieStore = await cookies();

	// ── JWT должен быть установлен в обоих случаях ────────────────────────────
	// При регистрации: registerAction вызывает payload.login() и ставит cookie
	// При логине:      loginAction вызывает payload.login() и ставит cookie
	const payloadToken = cookieStore.get("payload-token");
	if (!payloadToken) {
		return actionError("Сессия не найдена. Войдите снова.");
	}

	const payload = await getPayloadInstance();

	// Получаем пользователя из JWT
	let userId: string;
	let userEmail: string;
	let userName: string;
	try {
		// Передаём реальные заголовки запроса (не только cookie) — Payload's
		// cookie-стратегия извлечения JWT сверяет Origin/Sec-Fetch-Site со
		// списком csrf (см. payload.config.ts: csrf строится из ALLOWED_ORIGINS)
		// и молча возвращает null, если синтетический Headers содержит только
		// cookie без этих заголовков (см. node_modules/payload/dist/auth/
		// extractJWT.js). Из-за этого валидный токен не проходил проверку и
		// verifyOtpAction всегда получал user: null после успешного логина.
		const { user } = await payload.auth({ headers: await headers() });
		if (!user || !isUser(user)) {
			return actionError("Сессия истекла. Войдите снова.");
		}
		userId = String(user.id);
		userEmail = user.email;
		userName = user.name;
	} catch {
		return actionError("Не удалось проверить сессию. Войдите снова.");
	}

	// ── Проверяем сессию (для обоих типов) ───────────────────────────────────
	const sessionId = cookieStore.get("session-id")?.value;
	if (sessionId) {
		const session = await getActiveSession(payload, sessionId);
		if (!session) {
			return actionError("Сессия недействительна. Войдите снова.");
		}
	}

	// ── Верифицируем OTP ──────────────────────────────────────────────────────
	const result = await verifyOtpCode(payload, {
		userId,
		type,
		code,
	});

	if (!result.ok) {
		const messages: Record<typeof result.reason, string> = {
			not_found: "Код не найден. Запросите новый.",
			expired: "Код истёк. Запросите новый.",
			used: "Код уже использован. Запросите новый.",
			max_attempts: "Превышено количество попыток. Запросите новый код.",
			invalid: "Неверный код. Попробуйте ещё раз.",
		};
		// Только max_attempts получает отдельный code — UI показывает его как
		// предупреждение (жёлтый), а не как обычную ошибку неверного ввода.
		const codes: Partial<Record<typeof result.reason, AuthErrorCode>> = {
			max_attempts: "rate_limited",
		};
		return actionError(
			messages[result.reason],
			undefined,
			codes[result.reason],
		);
	}

	// ── Обновляем пользователя ────────────────────────────────────────────────
	await payload.update({
		collection: "users",
		id: Number(userId),
		data: {
			twoFAVerified: true,
			twoFAVerifiedAt: new Date().toISOString(),
			...(type === "email_verify" ? { emailVerified: true } : {}),
		},
		overrideAccess: true,
	});

	// ── Уведомление о входе ──────────────────────────────────────────────────
	// Раньше уходило из loginAction сразу после проверки пароля — то есть
	// одновременно с письмом с OTP-кодом, хотя фактический вход завершается
	// только здесь, после успешной проверки кода. Отправляем только для
	// login_2fa: email_verify — это подтверждение регистрации, не вход.
	if (type === "login_2fa") {
		const { ip, userAgent } = await getRequestMeta();
		const deviceLabel = parseDeviceLabel(userAgent);
		void notifyNewSessionLogin({ email: userEmail, userName, deviceLabel, ip });
		void notify(payload, userId, "login_new_device", { deviceLabel, ip });
	}

	// ── Обновляем lastActiveAt сессии ────────────────────────────────────────
	if (sessionId) {
		await payload.update({
			collection: "sessions",
			id: sessionId,
			data: { lastActiveAt: new Date().toISOString() },
			overrideAccess: true,
		});
	}

	return actionSuccess<OtpVerifyResult>({ redirectTo: "/profile" });
}
