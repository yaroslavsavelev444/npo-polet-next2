// src/modules/cart/types/index.ts
import type { ProductCardData } from "@/modules/productCard";

export interface CartItemView {
	product: ProductCardData;
	quantity: number;
	addedAt: string;
	unitPrice: number;
	unitFinalPrice: number;
	subtotal: number;
	subtotalWithoutDiscount: number;
	itemDiscount: number;
}

export interface CartValidationIssue {
	productId: string;
	productTitle: string;
	currentQuantity: number;
	minOrderQuantity: number;
	message: string;
}

/**
 * Позиция, которую больше нельзя заказать.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ОТДЕЛЬНЫЙ СПИСОК, А НЕ ФЛАГ В `items`
 * ────────────────────────────────────────────────────────────────────────────
 * Недоступная позиция не входит НИ В ОДИН расчёт: ни в суммы, ни в счётчик,
 * ни в состав заказа. Держи её в `items` с флагом — и каждое место, которое
 * перебирает позиции (оптимистичный пересчёт в сторе, скидки, промокод,
 * создание заказа, счётчик в шапке), обязано было бы про этот флаг помнить.
 * Достаточно одного забытого перебора, чтобы снятый с продажи товар уехал в
 * оформленный заказ. Отдельный список делает такую ошибку невозможной по
 * построению: до расчётов эти позиции просто не доходят.
 *
 * При этом исчезать бесследно они не должны — пользователь их выбирал, и
 * пропажа строки читается как потеря данных, а не как «товар сняли с
 * продажи». Поэтому запись несёт всё, что нужно для полноценной строки в
 * списке корзины: карточку товара и количество.
 *
 * `product` и `title` пустые только у товара, которого в выдаче нет вовсе
 * (удалён или снят с публикации) — показать и назвать его нечем.
 */
export interface CartUnavailableItem {
	productId: string;
	title: string | null;
	reason: "unavailable" | "gone";
	/** Сколько штук лежит в корзине — строка показывает то же, что и раньше. */
	quantity: number;
	/**
	 * Карточка товара для отрисовки строки: кадр, цена, ссылка. `null`, когда
	 * товара в базе больше нет.
	 */
	product: ProductCardData | null;
	/**
	 * Готовая подпись причины («Нет в наличии», «Снят с производства»,
	 * «Снят с продажи»). Считается на сервере рядом с самой проверкой, чтобы
	 * интерфейсу не пришлось заводить вторую таблицу соответствий.
	 */
	statusLabel: string;
}

export interface CartSummary {
	totalItems: number;
	itemsCount: number;
	priceWithoutDiscount: number;
	productDiscountAmount: number;
	centralDiscountAmount: number;
	centralDiscountPercent: number;
	totalDiscount: number;
	totalPrice: number;
}

export interface AppliedDiscount {
	id: string;
	name: string;
	discountPercent: number;
	amount: number;
	message: string;
}

export interface DiscountHint {
	message: string;
	/**
	 * Процент скидки, до которой не хватает. Приходит из того же расчёта, что и
	 * сообщение (discount-calculator), и нужен интерфейсу отдельным числом:
	 * выдирать его регулярным выражением из готовой фразы — верный способ
	 * однажды показать «NaN%» после правки формулировки.
	 */
	discountPercent: number;
	needed?: { quantity?: number; amount?: number };
	current?: { quantity?: number; amount?: number };
}

export interface CartView {
	items: CartItemView[];
	summary: CartSummary;
	validation: { isValid: boolean; issues: CartValidationIssue[] };
	discounts: { applied: AppliedDiscount[]; hints: DiscountHint[] };
	unavailable: CartUnavailableItem[];
	updatedAt: string | null;
}

/**
 * Минимальная запись позиции: всё, что о корзине знает гость. Хранится в
 * localStorage и уходит на сервер только для расчёта цен и для слияния после
 * входа — цены в ней НЕ хранятся намеренно, иначе клиент мог бы предъявить
 * свою цену на оформлении.
 */
export interface CartEntry {
	productId: string;
	quantity: number;
	addedAt?: string | null;
}

export type CartActionErrorCode =
	| "AUTH_REQUIRED"
	| "PRODUCT_UNAVAILABLE"
	| "MAX_QUANTITY_EXCEEDED"
	| "UNKNOWN";

export type CartActionResult =
	| { success: true; data: CartView }
	| { success: false; error: CartActionErrorCode; message: string };

/**
 * Результат слияния гостевой корзины с серверной. Отдельный тип, а не
 * CartActionResult: интерфейсу нужно знать не только итоговую корзину, но и
 * что именно не перенеслось, — иначе «товаров стало меньше» выглядит как
 * ошибка приложения.
 */
export type CartMergeResult =
	| { success: true; data: CartView; skipped: CartUnavailableItem[] }
	| { success: false; error: CartActionErrorCode; message: string };
