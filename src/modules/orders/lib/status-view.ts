import type { OrderStatus } from "../types";

/**
 * Как показывать статус заказа.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ТОН, А НЕ ЦВЕТ НАПРЯМУЮ
 * ────────────────────────────────────────────────────────────────────────────
 * Статусов десять, а состояний, в которых покупатель принимает решение, —
 * пять. Тон отвечает на вопрос «что это значит для меня»:
 *
 *   wait     — ждём не мы, а нас: заказ оформлен, дальше ход за менеджером;
 *   progress — заказ движется, делать ничего не нужно;
 *   action   — ход за покупателем (заказ ждёт в пункте выдачи);
 *   done     — заказ закрыт успешно;
 *   stopped  — заказ остановлен.
 *
 * Прежняя карта (ORDER_STATUS_BADGE_VARIANT) красила «Подтверждён» в accent, а
 * «В обработке», «Упакован», «Отправлен» и «Готов к выдаче» одинаково в
 * primary — то есть единственное состояние, где от покупателя что-то требуется,
 * ничем не отличалось от трёх, где не требуется ничего.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЦВЕТ НЕ ЕДИНСТВЕННЫЙ ПРИЗНАК
 * ────────────────────────────────────────────────────────────────────────────
 * У каждого статуса свой значок: силуэт различает состояния и при
 * дальтонизме, и на плохом экране, и в распечатке. Плюс подпись словом —
 * цвет здесь только усиливает, но ничего не сообщает в одиночку.
 *
 * Подписи статусов не дублируются: они остаются в ORDER_STATUS_LABELS —
 * единственном источнике, из которого их берут и список, и timeline, и
 * страница успеха.
 */

export type OrderStatusTone =
	| "wait"
	| "progress"
	| "action"
	| "done"
	| "stopped";

export type OrderStatusIcon =
	| "clock"
	| "invoice"
	| "check"
	| "cog"
	| "box"
	| "truck"
	| "store"
	| "done"
	| "cancel"
	| "refund";

export interface OrderStatusView {
	tone: OrderStatusTone;
	icon: OrderStatusIcon;
	/**
	 * Что это значит и что делать. Пояснение, а не пересказ подписи: строка
	 * «Отправлен — заказ отправлен» не добавляет ничего.
	 */
	hint: string;
}

export const ORDER_STATUS_VIEW: Record<OrderStatus, OrderStatusView> = {
	pending: {
		tone: "wait",
		icon: "clock",
		hint: "Менеджер свяжется с вами для подтверждения",
	},
	awaiting_invoice: {
		tone: "wait",
		icon: "invoice",
		hint: "Счёт готовится — он появится во вложениях к заказу",
	},
	confirmed: {
		tone: "progress",
		icon: "check",
		hint: "Заказ подтверждён и передан на сборку",
	},
	processing: {
		tone: "progress",
		icon: "cog",
		hint: "Заказ собирают на складе",
	},
	packed: {
		tone: "progress",
		icon: "box",
		hint: "Заказ упакован и готов к отправке",
	},
	shipped: {
		tone: "progress",
		icon: "truck",
		hint: "Заказ в пути",
	},
	ready_for_pickup: {
		tone: "action",
		icon: "store",
		hint: "Заказ ждёт вас — заберите его в пункте выдачи",
	},
	delivered: {
		tone: "done",
		icon: "done",
		hint: "Заказ получен",
	},
	cancelled: {
		tone: "stopped",
		icon: "cancel",
		hint: "Заказ отменён",
	},
	refunded: {
		tone: "stopped",
		icon: "refund",
		hint: "По заказу оформлен возврат",
	},
};

/** Заказ закрыт: движение по сценарию закончилось, этапы показывать нечего. */
export function isTerminalStatus(status: OrderStatus): boolean {
	const tone = ORDER_STATUS_VIEW[status].tone;
	return tone === "done" || tone === "stopped";
}
