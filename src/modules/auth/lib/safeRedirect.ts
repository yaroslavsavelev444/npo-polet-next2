/**
 * Разбор параметра `?from=` — куда вернуть пользователя после входа.
 *
 * Вынесено из proxy.ts отдельным модулем без зависимостей ровно затем, чтобы
 * эту границу можно было проверять тестом (tests/security/safe-redirect.test.ts):
 * логика маленькая, но ошибка в ней — это open redirect с доверенного домена,
 * то есть готовый фишинговый плацдарм.
 *
 * Исторически проверка выглядела как «начинается с / и не начинается с //».
 * Этого недостаточно: URL-парсер (и браузеры) в схемах http/https трактуют
 * обратный слэш как обычный, поэтому `/\evil.com` проходил обе проверки, а
 * `new URL("/\\evil.com", origin)` давал `https://evil.com/`.
 */

export interface SafeRedirectOptions {
	/** origin текущего запроса — результат обязан остаться на нём. */
	origin: string;
	/** Куда отправлять, если `from` отсутствует или не прошёл проверку. */
	fallback: string;
	/** Пути, на которые возвращать бессмысленно (гостевые/OTP) — см. proxy.ts. */
	isDisallowedTarget?: (pathname: string) => boolean;
}

export function resolveSafeRedirect(
	from: string | null | undefined,
	{ origin, fallback, isDisallowedTarget }: SafeRedirectOptions,
): string {
	if (!from) return fallback;

	// Обратный слэш и управляющие символы отсекаем до разбора: первый
	// эквивалентен слэшу для URL-парсера, вторые позволяют ломать заголовок
	// Location.
	const hasControlChar = Array.from(from).some((char) => {
		const code = char.codePointAt(0) ?? 0;
		return code < 0x20 || code === 0x7f;
	});
	if (from.includes("\\") || hasControlChar) return fallback;

	// Только относительный путь; `//host` — это protocol-relative URL.
	if (!from.startsWith("/") || from.startsWith("//")) return fallback;

	if (isDisallowedTarget?.(from)) return fallback;

	// Финальная проверка по факту: что бы ни осталось в строке, разобранный
	// адрес обязан указывать на тот же origin.
	try {
		const target = new URL(from, origin);
		if (target.origin !== origin) return fallback;
		if (isDisallowedTarget?.(target.pathname)) return fallback;
		return `${target.pathname}${target.search}${target.hash}`;
	} catch {
		return fallback;
	}
}
