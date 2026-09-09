/**
 * Основной валидатор email, объединяющий проверки из соседних файлов:
 *  - формат              → emailPatterns.ts (EMAIL_FORMAT_REGEX);
 *  - безопасность         → blockedEmailDomains.ts + emailPatterns.ts (blocklist).
 *
 * Регистрация открыта для почты ЛЮБОГО домена. Раньше здесь была третья
 * проверка — allowlist российских почтовых сервисов (allowedEmailDomains.ts):
 * адрес на gmail.com или outlook.com регистрацию не проходил. Это была
 * ошибочная трактовка запрета на авторизацию через иностранные сервисы:
 * запрет касается входа через чужой identity provider, а не доменной зоны
 * почтового ящика. Allowlist и функция isSupportedEmailDomain удалены
 * целиком; техническая валидация (формат, одноразовые и зарезервированные
 * домены, служебные local-part) осталась на месте.
 *
 * Функции чистые и изоморфные (без server-only зависимостей) — один и тот же
 * код используется и на клиенте (мгновенная подсказка в форме регистрации), и
 * на сервере (register.schema.ts → registerAction). Frontend-проверка нужна
 * только для UX; настоящая защита — серверная, потому что запрос можно
 * отправить в обход формы.
 */

import {
	isDisposableEmailDomain,
	isReservedPlaceholderDomain,
} from "./blockedEmailDomains";
import { EMAIL_FORMAT_REGEX, hasSuspiciousLocalPart } from "./emailPatterns";

/** Единый источник текстов ошибок — переиспользуется клиентом и сервером. */
export const EMAIL_ERROR_MESSAGES = {
	required: "Email обязателен",
	format: "Неверный формат email",
	reservedDomain:
		"Этот домен зарезервирован для тестирования и не принимает почту. Используйте реальный email",
	disposableDomain:
		"Одноразовые/временные почтовые сервисы не поддерживаются. Используйте постоянный email",
	suspiciousLocalPart: "Такой адрес не может быть использован для регистрации",
} as const;

export interface EmailParts {
	localPart: string;
	domain: string;
}

/** Разбивает email на local-part и домен (по последней «@»). */
export const splitEmail = (email: string): EmailParts | null => {
	const trimmed = email.trim();
	const atIndex = trimmed.lastIndexOf("@");
	if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;

	return {
		localPart: trimmed.slice(0, atIndex),
		domain: trimmed
			.slice(atIndex + 1)
			.trim()
			.toLowerCase(),
	};
};

/** Проверка только синтаксиса email. Возвращает текст ошибки или null. */
export const validateEmailFormat = (email: string): string | null => {
	if (!email || typeof email !== "string") return EMAIL_ERROR_MESSAGES.required;

	const trimmed = email.trim();
	if (!trimmed) return EMAIL_ERROR_MESSAGES.required;

	if (!EMAIL_FORMAT_REGEX.test(trimmed)) return EMAIL_ERROR_MESSAGES.format;

	return null;
};

/**
 * Отсекает заведомо тестовые/одноразовые адреса и подозрительные local-part —
 * с понятным сообщением, а не общим «неверный формат». Возвращает текст
 * ошибки или null.
 */
export const validateEmailSecurity = (email: string): string | null => {
	const parts = splitEmail(email);
	if (!parts) return EMAIL_ERROR_MESSAGES.format;

	const { localPart, domain } = parts;

	if (isReservedPlaceholderDomain(domain))
		return EMAIL_ERROR_MESSAGES.reservedDomain;

	if (isDisposableEmailDomain(domain))
		return EMAIL_ERROR_MESSAGES.disposableDomain;

	if (hasSuspiciousLocalPart(localPart))
		return EMAIL_ERROR_MESSAGES.suspiciousLocalPart;

	return null;
};

/**
 * Полная проверка email для формы регистрации: формат → безопасность.
 * Возвращает первую сработавшую ошибку или null. Доменная зона не
 * ограничивается ничем: yandex.ru, gmail.com, outlook.com и любой другой
 * корректный домен проходят одинаково.
 */
export const validateEmail = (email: string): string | null => {
	const formatError = validateEmailFormat(email);
	if (formatError) return formatError;

	return validateEmailSecurity(email);
};
