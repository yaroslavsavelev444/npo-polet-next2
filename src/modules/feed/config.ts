// src/modules/feed/config.ts
//
// Конфигурация YML-фида для Яндекс Директа / Яндекс Товаров.
//
// Реквизиты магазина и параметры доставки вынесены сюда, а не захардкожены
// внутри билдера, чтобы их можно было переопределить через переменные
// окружения без пересборки. Значения по умолчанию соответствуют текущему
// юрлицу. URL магазина берётся из единого источника правды baseURL
// (src/resources/content), тем же, что использует sitemap/robots, — так
// ссылки в фиде гарантированно совпадают с каноническими адресами сайта.

import { baseURL } from "@/resources/content";

/** Максимум изображений на один offer по требованиям Яндекса. */
export const MAX_PICTURES_PER_OFFER = 10;

/**
 * Размер батча при постраничной выборке товаров из Payload. Фид может
 * содержать десятки тысяч offers, поэтому товары читаются страницами, а не
 * одним запросом с depth-populate всех связей сразу (это и переполняло бы
 * память, и держало бы одно длинное соединение с БД).
 */
export const FEED_BATCH_SIZE = Number.parseInt(
	process.env.FEED_BATCH_SIZE || "200",
	10,
);

/**
 * TTL кэша готового XML в секундах. Это лишь временной «предохранитель»:
 * основная инвалидация — точечная, по тегам products/categories/settings
 * (см. feed.service.ts и hooks/revalidateCache.ts). То есть при изменении
 * товара фид пересоберётся сразу, а не через час.
 */
export const FEED_CACHE_TTL_SECONDS = Number.parseInt(
	process.env.FEED_CACHE_TTL_SECONDS || "3600",
	10,
);

export interface ShopConfig {
	name: string;
	company: string;
	url: string;
	/** Валюта фида. Проект работает только в рублях. */
	currencyId: "RUB";
}

export const shopConfig: ShopConfig = {
	name: process.env.FEED_SHOP_NAME || "НПО ПОЛЕТ",
	company: process.env.FEED_SHOP_COMPANY || 'ООО "НПО ПОЛЕТ"',
	url: baseURL,
	currencyId: "RUB",
};

export interface DeliveryOption {
	/** Стоимость доставки, руб. */
	cost: string;
	/** Максимальный срок доставки в днях. */
	days: string;
	/** До скольки часов нужно оформить заказ для доставки в срок (0–24). */
	orderBefore?: string;
}

export const deliveryConfig: DeliveryOption = {
	cost: process.env.FEED_DELIVERY_COST || "300",
	days: process.env.FEED_DELIVERY_DAYS || "1",
	orderBefore: process.env.FEED_DELIVERY_ORDER_BEFORE || "18",
};

export const pickupConfig: DeliveryOption = {
	cost: process.env.FEED_PICKUP_COST || "0",
	days: process.env.FEED_PICKUP_DAYS || "0",
};
