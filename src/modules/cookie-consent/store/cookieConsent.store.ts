import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
	COOKIE_CONSENT_STORAGE_KEY,
	COOKIE_CONSENT_VERSION,
} from "../lib/config";

interface CookieConsentState {
	/** Пользователь сделал выбор (нажал одну из кнопок баннера). */
	decided: boolean;
	/** Согласие на аналитические cookie (Яндекс.Метрика). */
	analytics: boolean;
	/** Версия набора cookie, на которую пользователь давал согласие. */
	version: number;
	/** ISO-время сделанного выбора — для аудита/отладки. */
	decidedAt: string | null;
	/** Прошла ли гидратация из localStorage (иначе SSR отдал бы дефолт). */
	hasHydrated: boolean;

	acceptAll: () => void;
	acceptEssentialOnly: () => void;
	/** Сохранить произвольный выбор из «Настроек». */
	save: (choice: { analytics: boolean }) => void;
	/** Открыть баннер заново (например, из ссылки «Настройки cookie» в футере). */
	reopen: () => void;
	setHasHydrated: (value: boolean) => void;
}

/**
 * Выбор пользователя хранится в localStorage через persist-middleware, поэтому
 * переживает перезагрузку и не показывает баннер повторно. `hasHydrated`
 * не персистится: до окончания гидратации баннер не рендерится, чтобы не было
 * рассинхронизации с SSR-разметкой.
 */
export const useCookieConsentStore = create<CookieConsentState>()(
	persist(
		(set) => ({
			decided: false,
			analytics: false,
			version: COOKIE_CONSENT_VERSION,
			decidedAt: null,
			hasHydrated: false,

			acceptAll: () =>
				set({
					decided: true,
					analytics: true,
					version: COOKIE_CONSENT_VERSION,
					decidedAt: new Date().toISOString(),
				}),

			acceptEssentialOnly: () =>
				set({
					decided: true,
					analytics: false,
					version: COOKIE_CONSENT_VERSION,
					decidedAt: new Date().toISOString(),
				}),

			save: ({ analytics }) =>
				set({
					decided: true,
					analytics,
					version: COOKIE_CONSENT_VERSION,
					decidedAt: new Date().toISOString(),
				}),

			reopen: () => set({ decided: false }),

			setHasHydrated: (value) => set({ hasHydrated: value }),
		}),
		{
			name: COOKIE_CONSENT_STORAGE_KEY,
			// Персистим только сам выбор, без служебного hasHydrated.
			partialize: (state) => ({
				decided: state.decided,
				analytics: state.analytics,
				version: state.version,
				decidedAt: state.decidedAt,
			}),
			onRehydrateStorage: () => (state) => {
				if (!state) return;
				// Если состав cookie/политика обновились — считаем согласие
				// устаревшим и показываем баннер снова.
				if (state.version !== COOKIE_CONSENT_VERSION) {
					state.decided = false;
					state.analytics = false;
				}
				state.setHasHydrated(true);
			},
		},
	),
);

/**
 * Показывать ли баннер: только после гидратации и если решение ещё не принято.
 * Отдельный селектор, чтобы компоненты не дублировали эту логику.
 */
export const selectShouldShowBanner = (s: CookieConsentState): boolean =>
	s.hasHydrated && !s.decided;
