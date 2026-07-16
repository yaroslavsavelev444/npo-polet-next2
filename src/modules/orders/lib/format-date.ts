/** Форматирование дат заказа — единый вид по всему модулю. */

export function formatOrderDate(iso: string): string {
	return new Date(iso).toLocaleDateString("ru-RU", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	});
}

export function formatOrderDateTime(iso: string): string {
	return new Date(iso).toLocaleString("ru-RU", {
		day: "2-digit",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** Короткая дата+время для истории статусов: «15 июля, 12:24». */
export function formatOrderShortDateTime(iso: string): string {
	return new Date(iso).toLocaleString("ru-RU", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}
