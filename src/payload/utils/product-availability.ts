// src/payload/utils/product-availability.ts
import type { Product } from "@/payload-types";

/**
 * ЕДИНСТВЕННОЕ определение «этот товар сейчас можно заказать».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЗАЧЕМ ОТДЕЛЬНЫЙ МОДУЛЬ
 * ────────────────────────────────────────────────────────────────────────────
 * Раньше это условие было переписано трижды почти одинаково — в расчёте
 * корзины (build-cart-view), в добавлении товара (addToCartAction) и в
 * слиянии гостевой корзины (mergeGuestCartAction). Три копии одного правила
 * расходятся при первой же правке: достаточно завести новый статус или новый
 * флаг, и корзина начинает считать товар доступным там, где добавление его
 * уже отклоняет. Поэтому правило живёт здесь одно, а все три места его
 * вызывают.
 *
 * Модуль намеренно чистый: ни запросов, ни импортов Payload Local API. Его
 * можно звать и из сервиса, и из Server Action, и из скрипта.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ЧТО ВХОДИТ В УСЛОВИЕ
 * ────────────────────────────────────────────────────────────────────────────
 *  1. Публикация (`_status`). У коллекции products включены черновики, и
 *     снятый с публикации товар не должен продаваться: выдача витрины его
 *     уже не показывает (см. PUBLISHED_ONLY в products.service), а корзина
 *     получает товар через relationship, где этот фильтр не работает.
 *  2. `inventory.isVisible` — «убрать из продажи», не трогая карточку.
 *  3. `inventory.status` — продаются только «в наличии» и «предзаказ».
 *
 * Значения по умолчанию совпадают с defaultValue в коллекции: отсутствующее
 * поле означает «как у нового товара», а не «нельзя заказать».
 */

/** Статусы, при которых товар продаётся. Совпадает с фильтром YML-фида. */
export const ORDERABLE_PRODUCT_STATUSES = ["available", "preorder"] as const;

/**
 * Почему товар нельзя заказать. `null` — можно.
 *
 * Причина возвращается отдельно от булева ответа: интерфейсу корзины нужно
 * не только «нельзя», но и что именно сказать покупателю.
 */
export type ProductUnavailableReason =
	/** Снят с публикации или ещё черновик — на витрине его нет вовсе. */
	| "unpublished"
	/** Опубликован, но скрыт флагом `inventory.isVisible`. */
	| "hidden"
	/** «Нет в наличии» или «снят с производства». */
	| "status";

/** Минимум полей, которых достаточно для проверки. */
type ProductAvailabilityInput = Pick<Product, "_status" | "inventory">;

export function getProductUnavailableReason(
	product: ProductAvailabilityInput | null | undefined,
): ProductUnavailableReason | null {
	if (!product) return "unpublished";

	// `_status` отсутствует в выборках, сделанных без версий, — это НЕ повод
	// считать товар черновиком: скрывать опубликованный товар из-за формы
	// запроса хуже, чем пропустить черновик, который и так отсеян фильтром
	// витрины.
	if (product._status === "draft") return "unpublished";

	if (product.inventory?.isVisible === false) return "hidden";

	const status = product.inventory?.status ?? "available";
	if (!(ORDERABLE_PRODUCT_STATUSES as readonly string[]).includes(status)) {
		return "status";
	}

	return null;
}

export function isProductOrderable(
	product: ProductAvailabilityInput | null | undefined,
): boolean {
	return getProductUnavailableReason(product) === null;
}
