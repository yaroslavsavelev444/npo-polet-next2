import type { Order } from "@/payload-types";

/**
 * Человекочитаемые подписи способов оплаты. Вынесено в отдельный модуль, т.к.
 * используется и в деталях заказа (модалка), и на странице успешного оформления.
 */
export const PAYMENT_METHOD_LABELS: Record<Order["payment"]["method"], string> =
	{
		invoice: "Банковский перевод по счёту",
		self_pickup_card: "Картой при самовывозе",
		self_pickup_cash: "Наличными при самовывозе",
	};

export const PAYMENT_STATUS_LABELS: Record<
	NonNullable<Order["payment"]["status"]>,
	string
> = {
	pending: "Ожидает оплаты",
	paid: "Оплачен",
	failed: "Ошибка оплаты",
	refunded: "Возврат",
};
