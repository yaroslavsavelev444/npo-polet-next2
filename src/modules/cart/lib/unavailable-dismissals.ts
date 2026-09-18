// src/modules/cart/lib/unavailable-dismissals.ts

/**
 * Закрытые уведомления о недоступных товарах.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ИМЕННО ЗАКРЫВАЕТСЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Крестик снимает ПОЛОСУ-УВЕДОМЛЕНИЕ, а не саму пометку. Строки товаров
 * остаются в корзине перечёркнутыми и подписанными «недоступен» — факт
 * недоступности скрыть нельзя, иначе покупатель решит, что товар войдёт в
 * заказ.
 *
 * Закрытие запоминается по id товаров, а не «полосы вообще». Поэтому:
 *   • ещё один товар ушёл с продажи — полоса возвращается, потому что это
 *     новость, которой пользователь не видел;
 *   • товар вернулся в продажу и снова пропал — полоса тоже возвращается:
 *     его id вычищается из списка, как только он перестаёт быть недоступным
 *     (см. pruneDismissed).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ localStorage, А НЕ ТОЛЬКО ПАМЯТЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Стор переживает переходы по сайту, но не перезагрузку страницы. Полоса,
 * возвращающаяся после каждого F5, — ровно то, что просили не делать. Тот же
 * приём и та же защита от недоступного хранилища, что в guest-cart-storage:
 * в приватном режиме Safari обращение бросает исключение, и корзина обязана
 * пережить это молча.
 */

const STORAGE_KEY = "polet:cart:unavailable-dismissed:v1";

/** Больше id в списке не бывает: предел позиций корзины — 50. */
const MAX_IDS = 50;

function read(): string[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((id): id is string => typeof id === "string")
			.slice(0, MAX_IDS);
	} catch {
		return [];
	}
}

function write(ids: string[]): void {
	if (typeof window === "undefined") return;
	try {
		if (ids.length === 0) window.localStorage.removeItem(STORAGE_KEY);
		else
			window.localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify(ids.slice(0, MAX_IDS)),
			);
	} catch {
		/* хранилище недоступно — закрытие проживёт до перезагрузки */
	}
}

export function readDismissed(): string[] {
	return read();
}

export function writeDismissed(ids: string[]): void {
	write(ids);
}

/**
 * Оставляет только те отметки, которые ещё к чему-то относятся.
 *
 * Без этого список рос бы вечно, а товар, вернувшийся в продажу и снова
 * снятый с неё, остался бы «уже закрытым» — то есть об исчезновении товара из
 * заказа пользователю никто бы не сказал.
 */
export function pruneDismissed(
	dismissed: string[],
	unavailableIds: string[],
): string[] {
	const live = new Set(unavailableIds);
	return dismissed.filter((id) => live.has(id));
}
