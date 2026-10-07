/**
 * modules/analytics/ecommerce.ts
 *
 * Электронная коммерция Яндекс.Метрики: события detail / add / remove /
 * purchase в window.dataLayer. Счётчик инициализирован с
 * `ecommerce: "dataLayer"` (widgets/Analytics/YandexMetrika) и сам читает этот
 * массив — и то, что положено до загрузки tag.js, и всё, что приходит после.
 * Формат — «стандартный» из справки Метрики: `{ ecommerce: { currencyCode,
 * <действие>: { products, actionField? } } }`.
 *
 * ─── Согласие ───────────────────────────────────────────────────────────────
 *
 * Без согласия на аналитические cookie событие не кладётся вовсе, а не
 * «копится до согласия»: данные о действиях до согласия Метрике не положены.
 * Проверка в момент события, а не при подключении модуля: пользователь может
 * включить или отозвать согласие посреди визита.
 *
 * Серверных счётчиков популярности (analytics.viewsCount/purchasesCount) это
 * ограничение не касается — там нет ни cookie, ни идентификатора посетителя,
 * только обезличенное «+1 товару» (см. ProductViewTracker).
 */
import type { CartItemView, CartView } from "@/modules/cart/types";
import { useCookieConsentStore } from "@/modules/cookie-consent/store/cookieConsent.store";
import type { ProductCardData } from "@/modules/productCard";
import {
	type EcommerceProduct,
	type EcommercePurchase,
	toEcommerceProduct,
} from "./lib/ecommerce-product";

export type { EcommerceProduct, EcommercePurchase };
export { toEcommerceProduct };

declare global {
	interface Window {
		dataLayer?: unknown[];
	}
}

type EcommerceAction = "detail" | "add" | "remove";

function canTrack(): boolean {
	if (typeof window === "undefined") return false;
	const { hasHydrated, analytics } = useCookieConsentStore.getState();
	return hasHydrated && analytics;
}

function push(ecommerce: Record<string, unknown>): void {
	if (!canTrack()) return;
	window.dataLayer = window.dataLayer ?? [];
	window.dataLayer.push({ ecommerce: { currencyCode: "RUB", ...ecommerce } });
}

export function trackEcommerce(
	action: EcommerceAction,
	products: EcommerceProduct[],
): void {
	if (products.length === 0) return;
	push({ [action]: { products } });
}

export function trackPurchase(purchase: EcommercePurchase): void {
	const { products, ...actionField } = purchase;
	push({ purchase: { actionField, products } });
}

/** Позиция корзины: цена — та, что посчитал сервер для этой позиции. */
function fromCartItem(item: CartItemView, quantity: number): EcommerceProduct {
	return {
		...toEcommerceProduct(item.product, quantity),
		price: item.unitFinalPrice,
	};
}

export function findCartItem(
	view: CartView | null,
	productId: string,
): CartItemView | undefined {
	return view?.items.find((item) => item.product.id === productId);
}

/** Добавление: позиция из ответа сервера, а без неё — данные карточки. */
export function trackCartAdd(
	product: ProductCardData,
	quantity: number,
	view: CartView | null,
): void {
	const item = findCartItem(view, product.id);
	trackEcommerce("add", [
		item ? fromCartItem(item, quantity) : toEcommerceProduct(product, quantity),
	]);
}

/**
 * Удаление позиции. Недоступная позиция лежит не в `items`, а в
 * `unavailable` — данные берутся оттуда. Если состав корзины ещё не загружен
 * (кнопка «Убрать» на карточке каталога), известен только id — Метрике его
 * достаточно.
 */
export function trackCartRemove(
	productId: string,
	previous: CartView | null,
): void {
	const item = findCartItem(previous, productId);
	if (item) {
		trackEcommerce("remove", [fromCartItem(item, item.quantity)]);
		return;
	}
	const unavailable = previous?.unavailable.find(
		(entry) => entry.productId === productId,
	);
	trackEcommerce("remove", [
		unavailable?.product
			? toEcommerceProduct(unavailable.product, unavailable.quantity)
			: {
					id: productId,
					name: unavailable?.title ?? undefined,
					quantity: unavailable?.quantity,
				},
	]);
}

/**
 * Изменения состава между двумя состояниями корзины: рост количества —
 * `add`, убыль и исчезновение позиции — `remove`, на разницу в штуках. Так
 * правка количества, очистка и повтор заказа описываются одним правилом.
 */
export function trackCartDiff(previous: CartView, next: CartView): void {
	const added: EcommerceProduct[] = [];
	const removed: EcommerceProduct[] = [];

	for (const item of next.items) {
		const before = findCartItem(previous, item.product.id)?.quantity ?? 0;
		if (item.quantity > before) {
			added.push(fromCartItem(item, item.quantity - before));
		}
	}
	for (const item of previous.items) {
		const after = findCartItem(next, item.product.id)?.quantity ?? 0;
		if (item.quantity > after) {
			removed.push(fromCartItem(item, item.quantity - after));
		}
	}

	trackEcommerce("add", added);
	trackEcommerce("remove", removed);
}
