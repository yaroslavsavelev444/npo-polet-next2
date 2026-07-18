/**
 * Мостик между шапкой товара (рейтинг) и блоком вкладок: клик по рейтингу
 * должен открыть вкладку «Отзывы» и прокрутить к ней. Шапка — серверный
 * компонент, вкладки — клиентский; связываем их через DOM-событие, не поднимая
 * состояние в общий клиентский родитель.
 */
export const OPEN_REVIEWS_EVENT = "npo:open-product-reviews";
export const PRODUCT_TABS_ANCHOR_ID = "product-tabs";

export function requestOpenReviews() {
	window.dispatchEvent(new CustomEvent(OPEN_REVIEWS_EVENT));
	document
		.getElementById(PRODUCT_TABS_ANCHOR_ID)
		?.scrollIntoView({ behavior: "smooth", block: "start" });
}
