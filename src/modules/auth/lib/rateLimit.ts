import { redis } from "./redis"; // правильный именованный импорт

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: Date;
}

/**
 * Sliding window rate limiter на базе Redis.
 *
 * @param key     - уникальный ключ (например `login:127.0.0.1`)
 * @param limit   - максимум запросов
 * @param windowMs - окно в миллисекундах
 */
export async function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number,
): Promise<RateLimitResult> {
	const redisKey = `rl:${key}`;

	try {
		const current = await redis.incr(redisKey); // используем redis напрямую

		if (current === 1) {
			await redis.pexpire(redisKey, windowMs);
		}

		const ttlMs = await redis.pttl(redisKey);
		const resetAt = new Date(Date.now() + Math.max(ttlMs, 0));

		return {
			allowed: current <= limit,
			remaining: Math.max(0, limit - current),
			resetAt,
		};
	} catch (err) {
		// При недоступности Redis — пропускаем, чтобы не блокировать пользователей
		console.error("[RateLimit] Redis error, allowing request:", err);
		return { allowed: true, remaining: limit, resetAt: new Date() };
	}
}

// ─── Предустановленные лимиты ──────────────────────────────────────────────

export const RATE_LIMITS = {
	login: (ip: string) => checkRateLimit(`login:${ip}`, 10, 60 * 60 * 1000),
	register: (ip: string) => checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000),
	forgotPassword: (ip: string) =>
		checkRateLimit(`forgot:${ip}`, 3, 60 * 60 * 1000),
	otpResend: (email: string) =>
		checkRateLimit(`otp_resend:${email}`, 3, 10 * 60 * 1000),
	// Обратная связь: не больше 5 обращений с одного IP за 15 минут.
	feedback: (ip: string) => checkRateLimit(`feedback:${ip}`, 5, 15 * 60 * 1000),
	// Отзывы: не больше 10 попыток отправки с одного IP за 15 минут
	// (один отзыв на товар уже гарантирован дедупликацией — это защита от
	// перебора/спама попытками).
	review: (ip: string) => checkRateLimit(`review:${ip}`, 10, 15 * 60 * 1000),
} as const;
