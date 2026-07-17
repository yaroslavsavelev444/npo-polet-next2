/**
 * Конфигурация cookie-согласия.
 *
 * На сайте используются две группы cookie:
 *  1. Необходимые (essential) — payload-token, session-id, pending-auth. Нужны
 *     для входа/сессии, ставятся httpOnly на сервере. Согласия не требуют
 *     (без них сайт технически неработоспособен), выключить их нельзя.
 *  2. Аналитические (analytics) — Яндекс.Метрика (в т.ч. Вебвизор: _ym_uid,
 *     _ym_d, _ym_isad, _ym_visorc...). Не являются строго необходимыми,
 *     поэтому загружаются ТОЛЬКО после явного согласия пользователя.
 */

/** Ключ в localStorage. */
export const COOKIE_CONSENT_STORAGE_KEY = "polet-cookie-consent";

/**
 * Версия текста/состава cookie. Увеличивайте при существенном изменении
 * набора cookie или политики — тогда у ранее согласившихся пользователей
 * баннер покажется снова (см. store: сравнение version).
 */
export const COOKIE_CONSENT_VERSION = 1;

/** Ссылка на политику использования cookie. */
export const COOKIE_POLICY_URL = "/consents/cookie";

export type ConsentCategory = "essential" | "analytics";

export interface CookieCategoryMeta {
	key: ConsentCategory;
	title: string;
	description: string;
	/** Необходимые нельзя отключить — тумблер всегда включён и заблокирован. */
	required: boolean;
}

export const COOKIE_CATEGORIES: readonly CookieCategoryMeta[] = [
	{
		key: "essential",
		title: "Необходимые",
		description:
			"Обеспечивают вход в аккаунт, безопасность сессии и работу корзины. Без них сайт не функционирует, поэтому отключить их нельзя.",
		required: true,
	},
	{
		key: "analytics",
		title: "Аналитические",
		description:
			"Яндекс.Метрика: помогает понять, как посетители пользуются сайтом, чтобы делать его удобнее. Можно отключить.",
		required: false,
	},
];
