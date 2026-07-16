"use server";

import { AUTH_FLOW_CONTEXT } from "@/payload/hooks/users/requireServerAuthFlow";
import { getPayloadInstance } from "@/payload/services/getPayload";
import { notify } from "@/services/notifications/notificationCenter";
import { notifyAccountLocked } from "@/services/notifications/notifyAccountLocked";
import { notifyOtpCode } from "@/services/notifications/notifyOtpCode";
import {
	classifyLoginError,
	logUnexpectedAuthError,
	safeCreateOtp,
} from "../lib/errorHandling";
import { tryLegacyPasswordFallback } from "../lib/legacyPasswordFallback";
import { createPendingAuth } from "../lib/pendingAuth";
import { RATE_LIMITS } from "../lib/rateLimit";
import { redis } from "../lib/redis";
import { actionError, actionSuccess, getRequestMeta } from "../lib/utils";
import { loginSchema } from "../schemas/login.schema";
import type { LoginResult } from "../types";

/**
 * Server Action: первый шаг входа — проверка пароля.
 *
 * Поток:
 * 1. Валидация
 * 2. Rate limit по IP
 * 3. payload.login() — проверяет пароль, возвращает JWT token. Блокировку
 *    по числу попыток (loginAttempts/lockUntil) и её сброс на успешный вход
 *    Payload делает сам (auth.maxLoginAttempts/lockTime в Users.ts) — здесь
 *    её больше не дублируем (см. errorHandling.ts).
 * 4. Прячем выданный токен в pending-auth (Redis), клиенту отдаём только
 *    непредсказуемый идентификатор челленджа в cookie
 * 5. Генерируем OTP login_2fa + отправляем email
 * 6. Возвращаем requiresOtp: true
 *
 * ВАЖНО: успешная проверка пароля НЕ авторизует пользователя.
 * Ни payload-token, ни session-id, ни запись Session здесь не создаются —
 * всё это появляется только в verifyOtpAction, после проверки OTP-кода.
 * Раньше payload-token выставлялся прямо здесь, и пользователь между вводом
 * пароля и вводом кода уже был полноценно авторизован: payload.auth() (а
 * значит getCurrentUser, Navbar, корзина, избранное) видел его как обычного
 * залогиненного юзера, и это переживало перезагрузку страницы.
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
	let userName: string;

	// AUTH_FLOW_CONTEXT обязателен: без него beforeLogin-хук
	// requireServerAuthFlow отклонит вход как «мимо нашего flow» (так закрыт
	// прямой POST /api/users/login в обход OTP). Здесь передавать его
	// правомерно — токен из этого вызова наружу не уходит, а прячется в
	// pending-auth до подтверждения кода (см. ниже).
	const attemptLogin = () =>
		payload.login({
			collection: "users",
			data: { email, password },
			context: AUTH_FLOW_CONTEXT,
		});

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

		if (!loginResult.user) {
			throw new Error("No user returned");
		}

		loginToken = loginResult.token;
		userId = loginResult.user.id;
		userName = loginResult.user.name;
	} catch (err) {
		const { code, message } = classifyLoginError(err);

		if (code === "account_locked") {
			void notifyLockedOnce(payload, email);
		}

		return actionError(message, undefined, code);
	}

	// Уведомление о новом входе (email + in-app), запись Session и обновление
	// lastLoginAt происходят только ПОСЛЕ успешного прохождения OTP (см.
	// verifyOtpAction) — до этого момента вход не завершён.

	// Генерируем OTP для второго фактора. В отличие от отправки письма ниже,
	// без самой OTP-записи пользователю нечего вводить на следующем экране —
	// поэтому при сбое не пускаем дальше и просим повторить вход.
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

	// Прячем выданный payload.login() токен на сервере до подтверждения OTP.
	// Сбой (недоступность Redis) обязан остановить вход: без челленджа
	// verifyOtpAction не сможет завершить вход, а выдавать токен в обход OTP —
	// ровно то, что этот код и должен предотвращать.
	try {
		await createPendingAuth({
			userId: String(userId),
			email,
			name: userName,
			type: "login_2fa",
			token: loginToken,
			ip,
			userAgent,
		});
	} catch (err) {
		logUnexpectedAuthError("login.createPendingAuth", err);
		return actionError(
			"Не удалось начать вход. Попробуйте ещё раз через несколько минут.",
			undefined,
			"server_error",
		);
	}

	// notifyOtpCode (централизованный EmailService/Nodemailer) намеренно
	// пробрасывает ошибку доставки (см. её докстринг), чтобы вызывающий код
	// не притворялся, что письмо ушло. Но ронять весь Server Action из-за
	// этого не нужно (это вызывало падение рендера в проде): челлендж уже
	// создан, логируем сбой и всё равно пропускаем пользователя на экран
	// ввода OTP — там есть кнопка «отправить код повторно» (resendOtpAction),
	// которой можно будет воспользоваться, когда почтовый сервис
	// восстановится.
	try {
		await notifyOtpCode({ to: email, code: otp, purpose: "login_2fa" });
	} catch (err) {
		logUnexpectedAuthError("login.notifyOtpCode", err);
	}

	return actionSuccess<LoginResult>({ requiresOtp: true, email });
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
		const firstTime = await redis.set(
			dedupeKey,
			"1",
			"PX",
			15 * 60 * 1000,
			"NX",
		);
		if (!firstTime) return;

		await notifyAccountLocked({
			email: user.email as string,
			userName: user.name as string,
			lockedUntil: lockUntil,
		});
		const minutesLeft = Math.max(
			1,
			Math.ceil((lockUntil.getTime() - Date.now()) / 60000),
		);
		void notify(payload, user.id, "account_locked", { minutesLeft });
	} catch (err) {
		logUnexpectedAuthError("login.notifyLockedOnce", err);
	}
}
