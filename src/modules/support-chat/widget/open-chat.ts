import type { SupportTopic } from "../lib/constants";
import type { MessageContext } from "../lib/events";

/**
 * Открыть чат с менеджером из любого места витрины — кнопкой «Задать
 * вопрос о товаре», «Вопрос по заказу» и т.п.
 *
 * Через событие окна, а не через общий стор: кнопки живут в серверно
 * отрендеренных страницах разных модулей, а виджет — один на макет. Если
 * виджета на странице нет (оформление заказа, вход), событие просто никто
 * не слушает.
 *
 * Контекст прикрепляется к следующему сообщению покупателя карточкой —
 * менеджер сразу видит, о каком заказе или товаре речь.
 */

export const OPEN_CHAT_EVENT = "support-chat:open";

export interface OpenChatDetail {
	context?: MessageContext;
	topic?: SupportTopic;
}

export function openSupportChat(detail: OpenChatDetail = {}): void {
	window.dispatchEvent(
		new CustomEvent<OpenChatDetail>(OPEN_CHAT_EVENT, { detail }),
	);
}

// ─── Доступен ли чат на этой странице ──────────────────────────────────────
//
// Знает только кнопка чата (SupportWidget — по /api/support/widget). Кнопки
// «Спросить менеджера» в страницах подписываются на это знание: пока чат не
// запущен или недоступен этому посетителю, их нет — кнопка, которая ничего
// не открывает, хуже её отсутствия.

let available = false;
const listeners = new Set<() => void>();

export function setChatAvailable(value: boolean): void {
	if (available === value) return;
	available = value;
	for (const listener of listeners) listener();
}

export function subscribeChatAvailable(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function isChatAvailable(): boolean {
	return available;
}
