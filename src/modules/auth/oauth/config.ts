import { getCachedSettings } from "@/payload/services/settings.service";

/**
 * Настройки входа через Яндекс ID.
 *
 * Включён вход, только когда выполнены оба условия:
 *   • ключи приложения заданы в окружении (схема — src/env.ts);
 *   • в админке отмечено «Настройки сайта → Вход через Яндекс ID»
 *     (по умолчанию выключено).
 *
 * null — фича выключена или не настроена: кнопки не рендерятся, роуты
 * /auth/yandex/* отвечают 404.
 */
export interface YandexConfig {
	clientId: string;
	clientSecret: string;
	/** Должен ТОЧНО совпадать с Redirect URI в настройках приложения на oauth.yandex.ru. */
	redirectUri: string;
	/** Origin витрины — для абсолютных редиректов и resolveSafeRedirect. */
	origin: string;
}

export const YANDEX_CALLBACK_PATH = "/auth/yandex/callback";

export async function isYandexIdEnabled(): Promise<boolean> {
	return (await getYandexConfig()) !== null;
}

export async function getYandexConfig(): Promise<YandexConfig | null> {
	const clientId = process.env.YANDEX_CLIENT_ID?.trim();
	const clientSecret = process.env.YANDEX_CLIENT_SECRET?.trim();
	if (!clientId || !clientSecret) return null;

	const settings = await getCachedSettings();
	if (!settings?.yandexId?.enabled) return null;

	// Origin берём из NEXT_PUBLIC_APP_URL, а не из запроса: за nginx запрос
	// приходит на внутренний адрес, а redirect_uri обязан совпасть с тем, что
	// зарегистрирован у Яндекса, побайтно.
	const origin = new URL(
		process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
	).origin;
	return {
		clientId,
		clientSecret,
		origin,
		redirectUri: `${origin}${YANDEX_CALLBACK_PATH}`,
	};
}
