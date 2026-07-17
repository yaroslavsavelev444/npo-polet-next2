"use client";

import { YandexMetrika } from "@/widgets/Analytics/YandexMetrika";
import { useCookieConsentStore } from "../store/cookieConsent.store";

/**
 * Гейт для аналитики: Яндекс.Метрика монтируется (и, соответственно, ставит
 * свои cookie `_ym_*`) только после явного согласия пользователя на
 * аналитические cookie. До гидратации и без согласия не рендерит ничего.
 *
 * Это ключевое звено согласия: скрипт Метрики физически не подгружается, пока
 * пользователь не нажал «Принять все» / не включил аналитику в настройках.
 * Необходимые (auth/session) cookie этим гейтом не управляются — они ставятся
 * на сервере и согласия не требуют.
 */
export function AnalyticsGate() {
	const hasHydrated = useCookieConsentStore((s) => s.hasHydrated);
	const analytics = useCookieConsentStore((s) => s.analytics);

	if (!hasHydrated || !analytics) return null;

	return <YandexMetrika />;
}
