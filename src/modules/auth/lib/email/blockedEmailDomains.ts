/**
 * Блок-лист доменов, которые НИКОГДА не должны проходить регистрацию, даже
 * если allowlist (allowedEmailDomains.ts) когда-нибудь расширят или проверку
 * обойдут. Дополнительный слой защиты поверх allowlist'а.
 *
 * Разделён по смыслу:
 *  - RESERVED_PLACEHOLDER_DOMAINS — домены-заглушки из стандартов (RFC 2606);
 *  - DISPOSABLE_EMAIL_DOMAINS     — одноразовые/temp-mail сервисы.
 *
 * Новый временный сервис или заглушку можно добавить сюда, не трогая логику
 * валидатора (emailValidator.ts).
 */

// Домены-заглушки, зарезервированные стандартами (RFC 2606 и аналогичными)
// для документации/тестов. Реальный пользователь никогда не получит на них письмо.
export const RESERVED_PLACEHOLDER_DOMAINS: ReadonlySet<string> = new Set([
	"example.com",
	"example.org",
	"example.net",
	"example.edu",
	"test.com",
	"test.example",
	"invalid",
	"localhost",
]);

// Известные одноразовые/temp-mail сервисы, которыми пользуются боты и скрипты
// для прогона регистрационных форм (не полный список, но покрывает основные).
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
	"mailinator.com",
	"guerrillamail.com",
	"guerrillamail.info",
	"guerrillamail.biz",
	"guerrillamail.org",
	"yopmail.com",
	"yopmail.net",
	"10minutemail.com",
	"10minutemail.net",
	"temp-mail.org",
	"tempmail.com",
	"tempmail.net",
	"throwawaymail.com",
	"trashmail.com",
	"fakeinbox.com",
	"sharklasers.com",
	"dispostable.com",
	"getnada.com",
	"maildrop.cc",
	"discard.email",
	"discardmail.com",
	"mohmal.com",
	"moakt.com",
	"tmailor.com",
	"emailondeck.com",
	"spamgourmet.com",
	"mytemp.email",
]);

export const isReservedPlaceholderDomain = (domain: string): boolean =>
	RESERVED_PLACEHOLDER_DOMAINS.has(domain.toLowerCase().trim());

export const isDisposableEmailDomain = (domain: string): boolean =>
	DISPOSABLE_EMAIL_DOMAINS.has(domain.toLowerCase().trim());
