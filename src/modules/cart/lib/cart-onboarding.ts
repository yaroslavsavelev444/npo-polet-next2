// src/modules/cart/lib/cart-onboarding.ts

/**
 * Локальная страховка отметки «подсказку о корзине уже показали».
 *
 * Источник истины — поле профиля `users.cartOnboardingSeenAt`: оно переживает
 * выход и вход, смену устройства и очистку браузера. Но запись в профиль —
 * сетевой вызов, и он может не пройти ровно в тот момент, когда пользователь
 * закрыл подсказку. Без локальной отметки следующая перезагрузка показала бы
 * объяснение снова — то есть ровно то поведение, которого быть не должно.
 *
 * Отметка привязана к id пользователя. Общий ключ на браузер был бы ошибкой:
 * на общем компьютере второй аккаунт не увидел бы подсказку, которую ему ещё
 * не показывали.
 */

const STORAGE_KEY = "polet:cart:onboarding:v1";

function readSeenIds(): string[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed)
			? parsed.filter((id): id is string => typeof id === "string")
			: [];
	} catch {
		return [];
	}
}

export function hasSeenCartOnboarding(userId: string): boolean {
	return readSeenIds().includes(userId);
}

export function rememberCartOnboardingSeen(userId: string): void {
	if (typeof window === "undefined") return;
	try {
		const ids = readSeenIds();
		if (ids.includes(userId)) return;
		// Держим последние 5 аккаунтов: на общем компьютере их бывает несколько,
		// но список не должен расти бесконечно.
		window.localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify([...ids.slice(-4), userId]),
		);
	} catch {
		/* хранилище недоступно — останется только серверная отметка */
	}
}
