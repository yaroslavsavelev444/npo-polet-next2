/**
 * Регулярные выражения для проверки email, вынесенные отдельно от логики
 * валидатора. Новое правило-паттерн можно добавить здесь, не трогая
 * emailValidator.ts.
 */

/**
 * Проверка синтаксиса email. Намеренно простой и надёжный паттерн:
 * непустая local-part, «@», непустой домен с точкой. Не пытается покрыть все
 * крайние случаи RFC 5322 — этого достаточно для формы, а строгую проверку
 * домена делает allowlist (allowedEmailDomains.ts).
 */
export const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Паттерны local-part (до «@»), характерные для автоматических QA/скриптов
 * и сканеров, а не для реальных пользователей. Проверяется ТОЛЬКО полное
 * совпадение (с учётом опциональных цифр/пробела в известных местах), чтобы не
 * ловить ложные срабатывания на живых именах вроде «testosterone» или
 * «contest2024».
 *
 * Список составлен по факту наблюдавшихся адресов: testuser1234, test123,
 * dupetest, lockouttest, errortest, finalcheck и т.п.
 */
export const SUSPICIOUS_LOCAL_PART_PATTERNS: readonly RegExp[] = [
	/^testuser\d*$/i,
	/^test\d+$/i,
	/^dupe ?test\d*$/i,
	/^duplicate ?test\d*$/i,
	/^lockout ?test\d*$/i,
	/^error ?test\d*$/i,
	/^final ?check\d*$/i,
	/^final ?test\d*$/i,
	/^qa ?test\d*$/i,
	/^sanity ?check\d*$/i,
	/^smoke ?test\d*$/i,
	/^automation ?test\d*$/i,
];

export const hasSuspiciousLocalPart = (localPart: string): boolean => {
	const normalized = localPart.trim();
	return SUSPICIOUS_LOCAL_PART_PATTERNS.some((re) => re.test(normalized));
};
