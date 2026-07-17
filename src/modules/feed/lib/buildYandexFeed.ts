// src/modules/feed/lib/buildYandexFeed.ts
//
// Чистые (без побочных эффектов и без обращений к БД) функции сборки YML-фида
// Яндекс Директа / Яндекс Товаров. Данные фетчатся и стримятся снаружи, в
// feed.service.ts; здесь — только преобразование уже загруженных документов
// Payload в строки XML. Такое разделение позволяет батчить выборку товаров и
// не держать в памяти весь каталог сразу.
//
// Формат offer — «упрощённый» (произвольный) тип YML: <offer> содержит <name>
// с полным названием товара. Это актуальная рекомендация Яндекса для
// интернет-магазинов и точнее ложится на нашу модель (у товара есть цельный
// title), чем legacy-тип vendor.model, который дробил бы название на
// typePrefix/vendor/model.

// Импортируем чистые функции напрямую из lib, а не из барреля productCard:
// баррель тянет и React-компоненты карточки, которым не место на серверном
// пути генерации фида. Логика расчёта цены и построения ссылки при этом та же.
import { mapDiscountPercentage } from "@/modules/productCard/lib/adapter";
import { calculatePriceBreakdown } from "@/modules/productCard/lib/pricing";
import { getProductHrefFromDoc } from "@/modules/productCard/lib/routing";
import type { Category, Media, Product } from "@/payload-types";
import {
	deliveryConfig,
	MAX_PICTURES_PER_OFFER,
	pickupConfig,
	shopConfig,
} from "../config";
import { ensureAbsoluteUrl, sanitizeDescription } from "./sanitize";
import { cdata, el, elRaw, escapeXmlAttr } from "./xml";

/** Статусы, при которых товар реально можно заказать и он попадает в фид. */
const SELLABLE_STATUSES = new Set(["available", "preorder"]);

/**
 * Дата фида в формате Яндекса: `YYYY-MM-DD HH:MM`. Часовой пояс — сервера;
 * абсолютная точность здесь не важна, это лишь метка «когда сгенерирован».
 */
export function formatYmlDate(date: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

function isPopulatedCategory(
	value: number | Category | null | undefined,
): value is Category {
	return typeof value === "object" && value !== null;
}

function isPopulatedMedia(
	value: number | Media | null | undefined,
): value is Media {
	return typeof value === "object" && value !== null;
}

/** `<category id="10">Название</category>` — плоский список, без parentId. */
export function renderCategory(category: Category): string {
	return el("category", category.name, { id: category.id });
}

export interface OfferRenderContext {
	/** id активных категорий, реально попавших в блок <categories>. */
	activeCategoryIds: Set<number>;
}

/**
 * Собирает один `<offer>` или возвращает null, если товар не должен попасть в
 * фид. Все проверки «пригодности» — здесь, чтобы не плодить в фиде offers,
 * которые Яндекс всё равно отклонит или которые ведут в никуда:
 *   - статус должен быть продаваемым (available/preorder);
 *   - цена строго положительная;
 *   - товар привязан к активной категории, попавшей в <categories>;
 *   - у товара есть slug (без него канонический URL недостижим — только
 *     legacy-id с 301-редиректом, а редиректы в фиде Яндекс считает ошибкой;
 *     та же логика, что в sitemap).
 */
export function renderOffer(
	product: Product,
	ctx: OfferRenderContext,
): string | null {
	const status = product.inventory?.status ?? "available";
	if (!SELLABLE_STATUSES.has(status)) return null;

	if (!isPopulatedCategory(product.category)) return null;
	const categoryId = product.category.id;
	if (!ctx.activeCategoryIds.has(categoryId)) return null;

	if (!product.slug) return null;

	const basePrice = product.pricing?.priceForIndividual ?? 0;
	if (!(basePrice > 0)) return null;

	// Цена считается ТЕМИ ЖЕ функциями, что и на карточке/странице товара
	// (mapDiscountPercentage + calculatePriceBreakdown). Это гарантирует, что
	// цена в фиде совпадёт с ценой на посадочной странице — иначе Яндекс
	// отклоняет offer за расхождение цены.
	const discountInfo = mapDiscountPercentage(
		product.pricing?.discount,
		basePrice,
	);
	const { finalPrice, hasDiscount } = calculatePriceBreakdown(basePrice, {
		isActive: discountInfo.isActive,
		percentage: discountInfo.percentage,
	});

	const price = Math.round(finalPrice * 100) / 100;
	if (!(price > 0)) return null;

	const url = `${shopConfig.url}${getProductHrefFromDoc(product)}`;
	const available = status === "available" || status === "preorder";

	const parts: string[] = [];

	// Ссылка и цена
	parts.push(el("url", url));
	parts.push(el("price", price));
	if (hasDiscount && basePrice > price) {
		parts.push(el("oldprice", Math.round(basePrice * 100) / 100));
	}
	parts.push(el("currencyId", shopConfig.currencyId));
	parts.push(el("categoryId", categoryId));

	// Изображения (абсолютные URL, не больше лимита Яндекса)
	if (product.images) {
		let count = 0;
		for (const media of product.images) {
			if (count >= MAX_PICTURES_PER_OFFER) break;
			if (!isPopulatedMedia(media)) continue;
			const picture = ensureAbsoluteUrl(media.url);
			if (!picture) continue;
			parts.push(el("picture", picture));
			count++;
		}
	}

	// Доставка / самовывоз
	parts.push(el("store", "true"));
	parts.push(el("pickup", "true"));
	parts.push(el("delivery", "true"));
	parts.push(
		elRaw(
			"delivery-options",
			`<option cost="${escapeXmlAttr(deliveryConfig.cost)}" days="${escapeXmlAttr(deliveryConfig.days)}"${
				deliveryConfig.orderBefore
					? ` order-before="${escapeXmlAttr(deliveryConfig.orderBefore)}"`
					: ""
			}/>`,
		),
	);
	parts.push(
		elRaw(
			"pickup-options",
			`<option cost="${escapeXmlAttr(pickupConfig.cost)}" days="${escapeXmlAttr(pickupConfig.days)}"/>`,
		),
	);

	// Название, производитель
	parts.push(el("name", product.title));
	const vendor = product.brand?.manufacturer?.trim();
	if (vendor) parts.push(el("vendor", vendor));

	// Описание (plain-text → CDATA)
	const description = sanitizeDescription(product.description ?? "");
	if (description) parts.push(elRaw("description", cdata(description)));

	// Характеристики → <param>, только видимые и заполненные
	if (product.specifications?.length) {
		for (const spec of product.specifications) {
			if (spec.isVisible === false) continue;
			const name = spec.name?.trim();
			const value = spec.value?.trim();
			if (!name || !value) continue;
			const unit = spec.unit?.trim();
			parts.push(el("param", value, { name, unit: unit || undefined }));
		}
	}

	// Мин. заказ, гарантия, вес, габариты
	const minQty = product.inventory?.minOrderQuantity ?? 1;
	if (minQty > 1) {
		parts.push(el("min-quantity", minQty));
		parts.push(el("sales_notes", `Минимальный заказ: ${minQty} шт.`));
	}
	if ((product.brand?.warrantyMonths ?? 0) > 0) {
		parts.push(el("manufacturer_warranty", "true"));
	}
	const weight = product.dimensions?.weight;
	if (weight && weight > 0) parts.push(el("weight", weight));
	const { length, width, height } = product.dimensions ?? {};
	if (length && width && height) {
		parts.push(el("dimensions", `${length}/${width}/${height}`));
	}

	return `<offer id="${escapeXmlAttr(String(product.id))}" available="${available ? "true" : "false"}">${parts.join("")}</offer>`;
}

/**
 * Верхняя часть документа — до открытия `<offers>` включительно. Категории
 * рендерятся здесь, а offers дописываются потоково в feed.service.ts.
 */
export function renderFeedHead(categories: Category[]): string {
	const categoriesXml = categories.map(renderCategory).join("");
	return (
		`<?xml version="1.0" encoding="UTF-8"?>` +
		`<yml_catalog date="${escapeXmlAttr(formatYmlDate())}">` +
		`<shop>` +
		el("name", shopConfig.name) +
		el("company", shopConfig.company) +
		el("url", shopConfig.url) +
		`<currencies><currency id="${shopConfig.currencyId}" rate="1"/></currencies>` +
		`<categories>${categoriesXml}</categories>` +
		`<offers>`
	);
}

/** Хвост документа — закрытие offers/shop/yml_catalog. */
export function renderFeedTail(): string {
	return `</offers></shop></yml_catalog>`;
}
