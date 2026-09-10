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
 * Позиция, которую больше нельзя заказать. В расчёт она не входит, но и
 * исчезать бесследно не должна: пользователь положил товар в корзину, и
 * молчаливое исчезновение строки читается как потеря данных, а не как
 * «товар сняли с продажи».
 *
 * `title` пустой только у товара, которого в выдаче нет вовсе (снят с
 * публикации или удалён) — назвать его нечем.
 */
export interface CartUnavailableItem {
	productId: string;
	title: string | null;
	reason: "unavailable" | "gone";
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
