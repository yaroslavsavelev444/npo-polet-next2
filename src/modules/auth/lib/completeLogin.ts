import { cookies } from "next/headers";
import type { BasePayload } from "payload";
import { logUnexpectedAuthError } from "./errorHandling";
import { extractPayloadSessionId } from "./payloadSessions";
import { createSession } from "./session";

/**
 * Завершение входа — ОДНО место, где гость становится авторизованным.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ВЫНЕСЕНО
 * ────────────────────────────────────────────────────────────────────────────
 * До появления доверенных устройств вход завершался ровно в одной точке — в
 * verifyOtpAction, — и держать этот код там было естественно. Теперь точек
 * две: подтверждённый кодом вход и вход с доверенного устройства, который
 * кода не требует (см. lib/trustedDevice.ts). Скопировать эти двадцать строк
 * во вторую точку было бы худшим из возможных решений: здесь выдаётся JWT,
 * ставятся обе cookie и заводится запись устройства, и любое расхождение
 * между копиями — это либо сессия без записи в «Активных устройствах», либо
 * cookie с одним сроком жизни против токена с другим.
 *
 * Поэтому оба пути обязаны проходить через эту функцию, и ничего, кроме неё,
 * не имеет права выставлять `payload-token`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧЕГО ЗДЕСЬ НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Ни уведомлений, ни редиректов, ни работы с доверенным устройством: у двух
 * путей они различаются (кодом подтверждают новое устройство — о нём пишут
 * письмо; доверенный вход письма не рождает), и вынесение их сюда потребовало
 * бы флагов, по которым функция делала бы разные вещи. Решает это вызывающий.
 */

/** 7 дней — совпадает с auth.tokenExpiration в коллекции users. */
const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface CompleteLoginInput {
	payload: BasePayload;
	userId: string;
	/** JWT, выданный payload.login() на шаге проверки пароля. */
	token: string;
	ip: string;
	userAgent: string;
	/** Проставить отметку аудита о пройденном втором факторе. */
	twoFactorPassed?: boolean;
	/** Проставить подтверждение почты (сценарий регистрации). */
	markEmailVerified?: boolean;
}

export interface CompleteLoginResult {
	/** id записи в `sessions`; null — запись не удалось создать. */
	sessionId: string | null;
}

export async function completeLogin({
	payload,
	userId,
	token,
	ip,
	userAgent,
	twoFactorPassed = false,
	markEmailVerified = false,
}: CompleteLoginInput): Promise<CompleteLoginResult> {
	const now = new Date().toISOString();

	// lastLoginAt — наше поле, которое Payload не знает и не обновляет сам (в
	// отличие от loginAttempts/lockUntil). Обновляется именно здесь: вход
	// завершается в этой функции и больше нигде.
	//
	// twoFAVerified/twoFAVerifiedAt — ОТМЕТКА АУДИТА «когда последний раз
	// подтверждали кодом», а не признак доступа. При входе с доверенного
	// устройства она не обновляется намеренно: кода не вводили, и записывать
	// обратное значило бы испортить единственный след, по которому потом
	// разбираются, с какого момента устройству верят.
	await payload.update({
		collection: "users",
		id: Number(userId),
		data: {
			lastLoginAt: now,
			...(twoFactorPassed ? { twoFAVerified: true, twoFAVerifiedAt: now } : {}),
			...(markEmailVerified ? { emailVerified: true } : {}),
		},
		overrideAccess: true,
	});

	// Имя 'payload-token' — стандартное имя, которое использует Payload; в
	// Server Action он не ставит cookie сам, только в Route Handler.
	const cookieStore = await cookies();
	cookieStore.set("payload-token", token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
	});

	// Session — артефакт для «Активных устройств» в профиле; её сбой не должен
	// отменять уже состоявшийся вход (payload-token выше уже выдан).
	try {
		const session = await createSession(payload, {
			userId,
			ip,
			userAgent,
			// Привязка записи к самой сессии Payload: без неё «завершить
			// сессию»/«выйти» отзывали бы только витринную запись, а выданный
			// выше JWT продолжал бы работать (см. payloadSessions.ts).
			payloadSessionId: extractPayloadSessionId(token),
		});

		cookieStore.set("session-id", String(session.id), {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
		});

		return { sessionId: String(session.id) };
	} catch (err) {
		logUnexpectedAuthError("completeLogin.createSession", err);
		return { sessionId: null };
	}
}
