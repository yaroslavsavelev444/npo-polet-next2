"use server";

import { cookies } from "next/headers";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notifyAccountLocked } from "@/services/notifications/notifyAccountLocked";
import { notifyNewSessionLogin } from "@/services/notifications/notifyNewSessionLogin";
import { notifyOtpCode } from "@/services/notifications/notifyOtpCode";
import {
  classifyLoginError,
  logUnexpectedAuthError,
  safeCreateOtp,
} from "../lib/errorHandling";
import { tryLegacyPasswordFallback } from "../lib/legacyPasswordFallback";
import { redis } from "../lib/redis";
import { RATE_LIMITS } from "../lib/rateLimit";
import { createSession, parseDeviceLabel } from "../lib/session";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";
import { loginSchema } from "../schemas/login.schema";
import type { LoginResult } from "../types";

/**
 * Server Action: вход пользователя.
 *
 * Поток:
 * 1. Валидация
 * 2. Rate limit по IP
 * 3. payload.login() — проверяет пароль, возвращает JWT token. Блокировку
 *    по числу попыток (loginAttempts/lockUntil) и её сброс на успешный вход
 *    Payload делает сам (auth.maxLoginAttempts/lockTime в Users.ts) — здесь
 *    её больше не дублируем (см. errorHandling.ts).
 * 4. Вручную ставим cookie payload-token (в Server Actions Payload не ставит сам)
 * 5. Генерируем OTP login_2fa + отправляем email
 * 6. Создаём Session запись
 * 7. Ставим session-id cookie
 * 8. Возвращаем requiresOtp: true
 *
 * ВАЖНО про cookie в Server Actions:
 * payload.login() возвращает { token, user } — token это JWT строка.
 * Cookie НЕ ставится автоматически в контексте Server Action (только в Route Handler).
 * Поэтому ставим вручную через next/headers cookies().
 */
export async function loginAction(_prevState: unknown, formData: FormData) {
	const parsed = loginSchema.safeParse({
		email: formData.get("email"),
		password: formData.get("password"),
	});

	if (!parsed.success) {
		return actionError(
			"Проверьте введённые данные",
			parsed.error.flatten().fieldErrors,
			"validation",
		);
	}

	const { email, password } = parsed.data;
	const { ip, userAgent } = await getRequestMeta();

	const rl = await RATE_LIMITS.login(ip);
	if (!rl.allowed) {
		return actionError(
			"Слишком много попыток входа. Попробуйте через час.",
			undefined,
			"rate_limited",
		);
	}

	const payload = await getPayloadInstance();

	// payload.login() — Payload проверяет пароль через bcrypt
	// Возвращает { token: string, user, exp }
	// Не передаём req — в Server Action он не нужен для получения token
	let loginToken: string;
	let userId: string | number;
	let userName = "";

	const attemptLogin = () =>
		payload.login({ collection: "users", data: { email, password } });

	try {
		let loginResult: Awaited<ReturnType<typeof attemptLogin>>;

		try {
			loginResult = await attemptLogin();
		} catch (err) {
			// payload.login() отклоняет пароль, если он захеширован ещё старой
			// системой (bcrypt) — Payload использует PBKDF2 и не умеет сверять
			// bcrypt-хеши напрямую. Пробуем legacy-fallback: если пароль совпал
			// со старым хешем, tryLegacyPasswordFallback уже перехешировал его
			// в формат Payload, и повторный payload.login() пройдёт как обычно.
			const migrated = await tryLegacyPasswordFallback(
				payload,
				email,
				password,
			);
			if (!migrated) throw err;
			loginResult = await attemptLogin();
		}

		if (!loginResult.token) {
			throw new Error("No token returned");
		}

		loginToken = loginResult.token;
		userId = loginResult.user ? loginResult.user.id : "";
		userName = loginResult.user ? (loginResult.user.name as string) : "";
	} catch (err) {
		const { code, message } = classifyLoginError(err);

		if (code === "account_locked") {
			void notifyLockedOnce(payload, email);
		}

		return actionError(message, undefined, code);
	}

	void notifyNewSessionLogin({
		email,
		userName,
		deviceLabel: parseDeviceLabel(userAgent),
		ip,
	});

	// lastLoginAt — наше поле, которое Payload не знает и не обновляет само
	// (в отличие от loginAttempts/lockUntil, которые он сам сбрасывает при
	// успешном входе). Ошибка здесь не должна превращать успешный вход в
	// "неверный email или пароль" — поэтому в отдельном try/catch, не в
	// общем блоке классификации ошибок логина выше.
	try {
		await payload.update({
			collection: "users",
			id: userId,
			data: { lastLoginAt: new Date().toISOString() },
			overrideAccess: true,
		});
	} catch (err) {
		logUnexpectedAuthError("login.updateLastLoginAt", err);
	}

	// Ставим JWT cookie вручную
	// Имя 'payload-token' — стандартное имя которое использует Payload
	const cookieStore = await cookies();
	cookieStore.set("payload-token", loginToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: 7 * 24 * 60 * 60, // 7 дней
	});

	// Генерируем OTP для второго фактора. В отличие от отправки письма ниже,
	// без самой OTP-записи пользователю нечего вводить на следующем экране —
	// поэтому при сбое не пускаем дальше и просим повторить вход (cookie уже
	// стоит, но это безопасное полу-авторизованное состояние: без валидного
	// OTP verifyOtpAction ничего не подтвердит).
	const otp = await safeCreateOtp(
		payload,
		{ userId: String(userId), type: "login_2fa", ip },
		"login.createOtp",
	);
	if (!otp) {
		return actionError(
			"Не удалось начать вход. Попробуйте ещё раз через несколько минут.",
			undefined,
			"server_error",
		);
	}

	// notifyOtpCode (централизованный EmailService/Nodemailer) намеренно
	// пробрасывает ошибку доставки (см. её докстринг), чтобы вызывающий код
	// не притворялся, что письмо ушло. Но payload-token cookie уже выставлена
	// строкой выше — на клиенте это de facto "полу-авторизованное" состояние,
	// ожидающее 2FA, и форма логина не умеет откатывать эту cookie при ошибке.
	// Поэтому не роняем весь Server Action (это и вызывало падение рендера в
	// проде): логируем сбой и всё равно пропускаем пользователя на экран
	// ввода OTP — там есть кнопка «отправить код повторно»
	// (resendOtpAction), которой можно будет воспользоваться, когда почтовый
	// сервис восстановится.
	try {
		await notifyOtpCode({ to: email, code: otp, purpose: "login_2fa" });
	} catch (err) {
		logUnexpectedAuthError("login.notifyOtpCode", err);
	}

	// Создаём сессию — необязательный для дальнейшего флоу артефакт
	// (verifyOtpAction работает и без cookie session-id, см. её код), поэтому
	// сбой здесь не должен блокировать вход целиком.
	try {
		const session = await createSession(payload, {
			userId: String(userId),
			ip,
			userAgent,
		});

		cookieStore.set("session-id", String(session.id), {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: 7 * 24 * 60 * 60,
		});
	} catch (err) {
		logUnexpectedAuthError("login.createSession", err);
	}

	return actionSuccess<LoginResult>({ requiresOtp: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Уведомление о блокировке аккаунта должно уйти один раз за окно блокировки,
 * а не на каждую следующую попытку входа локнутым пользователем (иначе — спам
 * писем). Дедуплицируем через Redis SETNX с TTL, привязанным к lockTime
 * (см. auth.lockTime в Users.ts).
 */
async function notifyLockedOnce(
	payload: Awaited<ReturnType<typeof getPayloadInstance>>,
	email: string,
) {
	try {
		const { docs } = await payload.find({
			collection: "users",
			where: { email: { equals: email } },
			limit: 1,
			overrideAccess: true,
			showHiddenFields: true,
		});

		const user = docs[0];
		if (!user?.lockUntil) return;

		const lockUntil = new Date(user.lockUntil);
		const dedupeKey = `locked-notified:${user.id}:${lockUntil.getTime()}`;
		const firstTime = await redis.set(dedupeKey, "1", "PX", 15 * 60 * 1000, "NX");
		if (!firstTime) return;

		await notifyAccountLocked({
			email: user.email as string,
			userName: user.name as string,
			lockedUntil: lockUntil,
		});
	} catch (err) {
		logUnexpectedAuthError("login.notifyLockedOnce", err);
	}
}
