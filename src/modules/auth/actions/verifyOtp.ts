"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notify } from "@/services/notifications/notificationCenter";
import { notifyNewSessionLogin } from "@/services/notifications/notifyNewSessionLogin";
import { logUnexpectedAuthError } from "../lib/errorHandling";
import { verifyOtpCode } from "../lib/OtpStore";
import { clearPendingAuth, readPendingAuth } from "../lib/pendingAuth";
import { createSession, parseDeviceLabel } from "../lib/session";
import { actionError } from "../lib/utils";
import type { AuthErrorCode } from "../types";

/** Куда попадает пользователь сразу после завершения входа. */
const REDIRECT_AFTER_LOGIN = "/profile";

const verifyOtpSchema = z.object({
	code: z
		.string()
		.length(6, "Код должен содержать 6 цифр")
		.regex(/^\d{6}$/, "Код должен содержать только цифры"),
	type: z.enum(["login_2fa", "email_verify"]),
});

/**
 * Server Action: верификация OTP-кода — единственное место, где вход
 * становится завершённым.
 *
 * Единый action для двух сценариев:
 * - email_verify (регистрация)
 * - login_2fa (вход)
 *
 * В обоих случаях пользователь приходит сюда НЕ авторизованным: пароль уже
 * проверен, но payload-token ему ещё не выдавался (см. login.ts/register.ts).
 * Поэтому идентифицируем его по pending-auth челленджу, а не через
 * payload.auth() — авторизовывать пока нечего.
 *
 * Только после успешной проверки кода: выдаём payload-token, создаём Session
 * и ставим session-id.
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

	// ── Незавершённый вход ────────────────────────────────────────────────────
	const pending = await readPendingAuth();
	if (!pending) {
		return actionError("Сессия подтверждения истекла. Войдите снова.");
	}
	// type приходит из формы — сверяем с тем, ради чего челлендж создавался,
	// иначе кодом одного назначения можно было бы закрыть другое.
	if (pending.type !== type) {
		return actionError("Сессия подтверждения истекла. Войдите снова.");
	}

	const payload = await getPayloadInstance();

	// ── Верифицируем OTP ──────────────────────────────────────────────────────
	const result = await verifyOtpCode(payload, {
		userId: pending.userId,
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
		// Челлендж намеренно НЕ трогаем: он нужен кнопке «отправить код
		// повторно» (resendOtpAction), в том числе после исчерпания попыток.
		// Прав он всё равно не даёт — единственное, что он открывает, это
		// экран ввода кода.
		return actionError(
			messages[result.reason],
			undefined,
			codes[result.reason],
		);
	}

	// ── Код верный: с этого момента вход считается состоявшимся ──────────────
	const now = new Date().toISOString();

	// lastLoginAt — наше поле, которое Payload не знает и не обновляет сам (в
	// отличие от loginAttempts/lockUntil). Обновляем его здесь, а не после
	// проверки пароля: вход завершается именно тут.
	await payload.update({
		collection: "users",
		id: Number(pending.userId),
		data: {
			twoFAVerified: true,
			twoFAVerifiedAt: now,
			lastLoginAt: now,
			...(type === "email_verify" ? { emailVerified: true } : {}),
		},
		overrideAccess: true,
	});

	// Выдаём JWT, который payload.login() вернул ещё на шаге проверки пароля.
	// Имя 'payload-token' — стандартное имя, которое использует Payload; в
	// Server Action он не ставит cookie сам, только в Route Handler.
	const cookieStore = await cookies();
	cookieStore.set("payload-token", pending.token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 7 * 24 * 60 * 60, // 7 дней — совпадает с auth.tokenExpiration
	});

	// Session — артефакт для «Активных устройств» в профиле; сбой не должен
	// отменять уже состоявшийся вход (payload-token выше уже выдан).
	// ip/userAgent берём из челленджа — это данные того же запроса, которым
	// вводили пароль.
	try {
		const session = await createSession(payload, {
			userId: pending.userId,
			ip: pending.ip,
			userAgent: pending.userAgent,
		});

		cookieStore.set("session-id", String(session.id), {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: 7 * 24 * 60 * 60,
		});
	} catch (err) {
		logUnexpectedAuthError("verifyOtp.createSession", err);
	}

	await clearPendingAuth();

	// ── Уведомление о входе ─────────────────────────────────────────────────
	// Раньше уходило из loginAction сразу после проверки пароля — то есть
	// одновременно с письмом с OTP-кодом, хотя фактический вход завершается
	// только здесь. Отправляем только для login_2fa: email_verify — это
	// подтверждение регистрации, не вход.
	if (type === "login_2fa") {
		const deviceLabel = parseDeviceLabel(pending.userAgent);
		void notifyNewSessionLogin({
			email: pending.email,
			userName: pending.name,
			deviceLabel,
			ip: pending.ip,
		});
		void notify(payload, pending.userId, "login_new_device", {
			deviceLabel,
			ip: pending.ip,
		});
	}

	// Вход только что изменил то, что рендерит корневой layout (Navbar с именем
	// пользователя, корзина, избранное). Без сброса кэша роутера клиент оставил
	// бы отрисованный до входа layout — навбар показывал бы «Войти» вплоть до
	// полной перезагрузки страницы. Раньше это было не заметно: payload-token
	// выдавался ещё до экрана OTP, и layout успевал отрендериться уже с
	// пользователем.
	revalidatePath("/", "layout");

	// redirect() именно здесь, а не router.push() на клиенте: навигация из
	// Server Action идёт уже после того, как выставлены cookies, и приносит
	// свежее RSC-дерево. redirect() бросает NEXT_REDIRECT, поэтому вызывается
	// вне try/catch — иначе исключение будет проглочено.
	redirect(REDIRECT_AFTER_LOGIN);
}
