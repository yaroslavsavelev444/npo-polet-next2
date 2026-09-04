import { redis } from "./redis"; // правильный именованный импорт

interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: Date;
}

interface RateLimitOptions {
	/**
	 * Как вести себя при недоступности Redis:
	 *  - false (по умолчанию) — fail-open: пропускаем запрос, чтобы сбой
	 *    инфраструктуры не ронял публичные формы (feedback/review), которые
	 *    без Redis работать могут.
	 *  - true — fail-closed: блокируем запрос. Для чувствительных auth-флоу
	 *    (login/register/forgot-password/otp-resend), которые без Redis всё
	 *    равно не могут завершиться (createPendingAuth/OTP пишут в Redis), —
	 *    иначе падение Redis снимало бы разом всю защиту от брутфорса/спама.
	 */
	failClosed?: boolean;
}

/**
 * Sliding window rate limiter на базе Redis.
 *
 * @param key      - уникальный ключ (например `login:127.0.0.1`)
 * @param limit    - максимум запросов
 * @param windowMs - окно в миллисекундах
 * @param options  - поведение при сбое Redis (см. RateLimitOptions)
 */
export async function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number,
	options: RateLimitOptions = {},
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
		if (options.failClosed) {
			// Fail-closed: блокируем. Эти флоу без Redis всё равно не завершатся,
			// поэтому «пропустить» здесь означало бы только открыть окно для
			// брутфорса, ничего не дав легитимному пользователю.
			console.error("[RateLimit] Redis error, blocking request:", err);
			return { allowed: false, remaining: 0, resetAt: new Date() };
		}
		// Fail-open: пропускаем, чтобы не блокировать пользователей.
		console.error("[RateLimit] Redis error, allowing request:", err);
		return { allowed: true, remaining: limit, resetAt: new Date() };
	}
}

// ─── Предустановленные лимиты ──────────────────────────────────────────────

// Чувствительные auth-флоу считаем fail-closed: они и так не могут
// завершиться без Redis (pending-auth/OTP), поэтому при сбое Redis блокируем,
// а не открываем окно для брутфорса. Публичные формы (feedback/review) —
// fail-open, чтобы сбой Redis не ронял их работу.
const FAIL_CLOSED: RateLimitOptions = { failClosed: true };

export const RATE_LIMITS = {
	login: (ip: string) =>
		checkRateLimit(`login:${ip}`, 10, 60 * 60 * 1000, FAIL_CLOSED),
	register: (ip: string) =>
		checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000, FAIL_CLOSED),
	forgotPassword: (ip: string) =>
		checkRateLimit(`forgot:${ip}`, 3, 60 * 60 * 1000, FAIL_CLOSED),
	otpResend: (email: string) =>
		checkRateLimit(`otp_resend:${email}`, 3, 10 * 60 * 1000, FAIL_CLOSED),
	// Ввод OTP: счётчик попыток самого кода (OTP_MAX_ATTEMPTS) ограничивает
	// перебор ОДНОГО кода, но не бесконечную цепочку «запросил новый код →
	// потратил 5 попыток → снова». Ограничение по IP закрывает перебор в целом,
	// оставляя запас для честных опечаток. fail-closed по тем же причинам, что
	// и остальные auth-флоу: без Redis челленджа всё равно не существует.
	otpVerify: (ip: string) =>
		checkRateLimit(`otp_verify:${ip}`, 20, 15 * 60 * 1000, FAIL_CLOSED),
	// Обратная связь: не больше 5 обращений с одного IP за 15 минут.
	feedback: (ip: string) => checkRateLimit(`feedback:${ip}`, 5, 15 * 60 * 1000),
	// Отзывы: не больше 10 попыток отправки с одного IP за 15 минут
	// (один отзыв на товар уже гарантирован дедупликацией — это защита от
	// перебора/спама попытками).
	review: (ip: string) => checkRateLimit(`review:${ip}`, 10, 15 * 60 * 1000),
	// Подбор промокодов. Ключ — пользователь, а не IP: применить код может
	// только вошедший покупатель, и по аккаунту перебор считается точнее (за
	// одним IP может сидеть целый офис легитимных клиентов). Лимит щедрый к
	// опечаткам и при этом закрывает перебор: коротких кодов не бывает
	// (PROMO_CODE_MIN_LENGTH), а 20 попыток за 10 минут делают подбор
	// бессмысленным. fail-open — сбой Redis не должен ронять оформление
	// заказа, которое и без промокода полностью рабочее.
	promoCode: (userId: string) =>
		checkRateLimit(`promo:${userId}`, 20, 10 * 60 * 1000),
} as const;
