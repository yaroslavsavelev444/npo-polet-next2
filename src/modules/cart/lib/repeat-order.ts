// src/modules/cart/lib/repeat-order.ts
import type { Order, Product } from "../../../../payload-types";
import {
	getProductUnavailableLabel,
	getProductUnavailableReason,
	PRODUCT_GONE_LABEL,
} from "../../../payload/utils/product-availability.ts";
import type {
	RepeatOrderLine,
	RepeatOrderSkippedLine,
} from "../types/index.ts";

/**
 * Что сделать с корзиной, чтобы повторить заказ, и что об этом сказать.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ ЧИСТАЯ ФУНКЦИЯ
 * ────────────────────────────────────────────────────────────────────────────
 * Все решения повтора — что доступно, сколько класть, что изменилось — живут
 * здесь, без запросов к базе. Server Action (repeatOrderAction) только
 * достаёт заказ и корзину, пишет результат одной записью и отдаёт сводку.
 * Так правила проверяются тестами без Payload, а сервер остаётся
 * единственным, кто их применяет.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПРАВИЛА
 * ────────────────────────────────────────────────────────────────────────────
 *  • Доступность — общее правило product-availability, то же, что у
 *    корзины. Недоступная позиция в корзину НЕ кладётся: там она только
 *    заблокировала бы оформление («уберите недоступные товары»). Но и не
 *    теряется — уходит в `skipped` с причиной.
 *  • Количество из заказа приводится к ТЕКУЩИМ ограничениям товара:
 *    меньше минимальной партии — поднимается до неё (иначе корзина не даст
 *    оформить заказ, см. validation в build-cart-view), больше предела на
 *    заказ или предела корзины — опускается до него. Каждая такая правка
 *    попадает в сводку.
 *  • С корзиной — правило МАКСИМУМА, как при слиянии гостевой корзины:
 *    после повтора товара в корзине не меньше, чем в заказе, но и не больше,
 *    чем было, если там уже лежало больше. Сумма превратила бы каждое
 *    нажатие «Повторить заказ» в ещё одну копию заказа; максимум делает
 *    повтор идемпотентным — второй запуск ничего не меняет.
 *  • Цена сравнивается за единицу с товарной скидкой: в заказе это
 *    totalPrice / quantity (итог строки без скидки корзины), сейчас — та же
 *    величина, посчитанная формулой корзины (`unitFinalPriceOf`).
 */

type OrderItem = NonNullable<Order["items"]>[number];

export interface RepeatOrderPlan {
	/** Итоговые количества товаров, которые нужно записать в корзину. */
	writes: { productId: string; quantity: number }[];
	lines: RepeatOrderLine[];
	skipped: RepeatOrderSkippedLine[];
}

interface PlanInput {
	items: OrderItem[];
	/** Количества, уже лежащие в корзине, по id товара. */
	cartQuantities: ReadonlyMap<string, number>;
	/** Текущая цена единицы с товарной скидкой — формула корзины. */
	unitFinalPriceOf: (product: Product) => number;
	/** Предел корзины на одну позицию. */
	maxItemQuantity: number;
}

function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

interface Group {
	product: Product | null;
	productId: string | null;
	name: string;
	quantity: number;
	totalPrice: number;
}

/**
 * Позиции заказа по товарам. Обычно один товар — одна строка, но сложить
 * дубли дешевле, чем полагаться на это: иначе вторая строка того же товара
 * «перезаписала» бы первую.
 */
function groupByProduct(items: OrderItem[]): Group[] {
	const groups = new Map<string, Group>();
	const gone: Group[] = [];

	for (const item of items) {
		const quantity = Math.max(1, Math.trunc(item.quantity) || 0);
		const product =
			typeof item.product === "object" && item.product !== null
				? item.product
				: null;

		// Связь не развернулась — товара в базе нет.
		if (!product) {
			gone.push({
				product: null,
				productId: item.product == null ? null : String(item.product),
				name: item.name,
				quantity,
				totalPrice: item.totalPrice,
			});
			continue;
		}

		const id = String(product.id);
		const existing = groups.get(id);
		if (existing) {
			existing.quantity += quantity;
			existing.totalPrice += item.totalPrice;
		} else {
			groups.set(id, {
				product,
				productId: id,
				name: item.name,
				quantity,
				totalPrice: item.totalPrice,
			});
		}
	}

	return [...groups.values(), ...gone];
}

export function planOrderRepeat({
	items,
	cartQuantities,
	unitFinalPriceOf,
	maxItemQuantity,
}: PlanInput): RepeatOrderPlan {
	const writes: RepeatOrderPlan["writes"] = [];
	const lines: RepeatOrderLine[] = [];
	const skipped: RepeatOrderSkippedLine[] = [];

	for (const group of groupByProduct(items)) {
		const { product } = group;

		if (!product || !group.productId) {
			skipped.push({
				productId: group.productId,
				title: group.name,
				quantity: group.quantity,
				statusLabel: PRODUCT_GONE_LABEL,
			});
			continue;
		}

		const reason = getProductUnavailableReason(product);
		if (reason) {
			skipped.push({
				productId: group.productId,
				title: group.name,
				quantity: group.quantity,
				statusLabel: getProductUnavailableLabel(product, reason),
			});
			continue;
		}

		// Те же границы, что у добавления в корзину: свой предел товара, но не
		// выше общего предела корзины.
		const minimum = Math.max(product.inventory?.minOrderQuantity ?? 1, 1);
		const ceiling = Math.min(
			product.inventory?.maxOrderQuantity || maxItemQuantity,
			maxItemQuantity,
		);

		let desired = group.quantity;
		let quantityAdjustment: RepeatOrderLine["quantityAdjustment"] = null;
		if (desired < minimum) {
			desired = minimum;
			quantityAdjustment = { reason: "min_order", limit: minimum };
		}
		if (desired > ceiling) {
			desired = ceiling;
			quantityAdjustment = { reason: "max_order", limit: ceiling };
		}

		const previousCartQuantity = cartQuantities.get(group.productId) ?? 0;
		const alreadyEnough = previousCartQuantity >= desired;
		if (!alreadyEnough) {
			writes.push({ productId: group.productId, quantity: desired });
		}

		const ordered = roundMoney(group.totalPrice / group.quantity);
		const current = roundMoney(unitFinalPriceOf(product));

		lines.push({
			productId: group.productId,
			title: group.name,
			orderedQuantity: group.quantity,
			previousCartQuantity,
			cartQuantity: alreadyEnough ? previousCartQuantity : desired,
			outcome: alreadyEnough ? "already_in_cart" : "added",
			quantityAdjustment,
			priceChange:
				Math.abs(ordered - current) >= 0.01 ? { ordered, current } : null,
		});
	}

	return { writes, lines, skipped };
}
