import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { OtpType } from "../types";
import { OTP_TTL_MS } from "./otp";
import { redis } from "./redis";

/**
 * Cookie с идентификатором «незавершённого входа» — состояние №2: пароль уже
 * проверен, но OTP ещё не подтверждён.
 *
 * Внутри лежит только непредсказуемый идентификатор, сам по себе не дающий
 * никаких прав: всё, что он открывает, — экран ввода OTP. Настоящий
 * payload-token появляется у клиента только после verifyOtpAction.
 */
export const PENDING_AUTH_COOKIE = "auth-challenge";

/**
 * Челлендж живёт ровно столько же, сколько сам OTP-код: когда вводить уже
 * нечего, «подвешенный» вход не должен продолжать существовать.
 */
const PENDING_AUTH_TTL_MS = OTP_TTL_MS;

export interface PendingAuth {
	userId: string;
	email: string;
	name: string;
	type: OtpType;
	/**
	 * JWT, выданный payload.login() ещё на шаге проверки пароля.
	 *
	 * Намеренно хранится на сервере, а не в cookie: до подтверждения OTP у
	 * клиента не должно быть ни одного пригодного к использованию токена —
	 * иначе payload.auth() (а через него Navbar, корзина, избранное и весь
	 * остальной код, см. getCurrentUser.ts) считает пользователя полностью
	 * авторизованным. Токен выдаётся браузеру только в verifyOtpAction.
	 *
	 * Генерировать токен позже, уже после проверки кода, нельзя: payload не
	 * экспортирует публично регистрацию сессии в user.sessions
	 * (addSessionToUser), от которой зависит проверка JWT при auth.useSessions
	 * — поэтому используем токен, выданный самим payload.login().
	 */
	token: string;
	/** IP и User-Agent момента ввода пароля — из них создаётся Session после OTP. */
	ip: string;
	userAgent: string;
}

const redisKey = (id: string) => `pending-auth:${id}`;

/**
 * Redis, а не БД: это короткоживущий секрет (bearer-токен), который должен
 * исчезнуть сам по TTL и не оседать в постоянном хранилище.
 *
 * Сбой Redis здесь намеренно пробрасывается наверх — вход должен падать
 * закрыто (в отличие от rate limit, который сознательно fail-open).
 */
export async function createPendingAuth(data: PendingAuth): Promise<void> {
	const id = randomBytes(32).toString("hex");

	await redis.set(
		redisKey(id),
		JSON.stringify(data),
		"PX",
		PENDING_AUTH_TTL_MS,
	);

	const cookieStore = await cookies();
	cookieStore.set(PENDING_AUTH_COOKIE, id, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: Math.floor(PENDING_AUTH_TTL_MS / 1000),
	});
}

export async function readPendingAuth(): Promise<PendingAuth | null> {
	const cookieStore = await cookies();
	const id = cookieStore.get(PENDING_AUTH_COOKIE)?.value;
	if (!id) return null;

	const raw = await redis.get(redisKey(id));
	if (!raw) return null;

	try {
		return JSON.parse(raw) as PendingAuth;
	} catch {
		return null;
	}
}

export async function clearPendingAuth(): Promise<void> {
	const cookieStore = await cookies();
	const id = cookieStore.get(PENDING_AUTH_COOKIE)?.value;

	if (id) {
		try {
			await redis.del(redisKey(id));
		} catch {
			// Ключ всё равно истечёт по TTL, а cookie удаляем ниже — недоступность
			// Redis не должна ронять уже успешно завершённый вход.
		}
	}

	cookieStore.delete(PENDING_AUTH_COOKIE);
}
