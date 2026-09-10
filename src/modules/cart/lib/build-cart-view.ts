// src/modules/cart/lib/build-cart-view.ts
import {
	calculatePriceBreakdown,
	mapProductToCardData,
} from "@/modules/productCard";
import { getApplicableDiscount } from "@/payload/services/discounts.service";
import { getCachedProducts } from "@/payload/services/products.service";
import type { Cart, Product } from "@/payload-types";
import type {
	CartEntry,
	CartItemView,
	CartSummary,
	CartUnavailableItem,
	CartValidationIssue,
	CartView,
} from "../types";

function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

function isPopulatedProduct(value: number | Product): value is Product {
	return typeof value === "object" && value !== null;
}

export const EMPTY_CART_VIEW: CartView = {
	items: [],
	summary: {
		totalItems: 0,
		itemsCount: 0,
		priceWithoutDiscount: 0,
		productDiscountAmount: 0,
		centralDiscountAmount: 0,
		centralDiscountPercent: 0,
		totalDiscount: 0,
		totalPrice: 0,
	},
	validation: { isValid: true, issues: [] },
	discounts: { applied: [], hints: [] },
	unavailable: [],
	updatedAt: null,
};

/**
 * Позиция, у которой товар уже загружен. Промежуточная форма между двумя
 * источниками корзины — документом Payload (товары приходят populated) и
 * гостевым списком в localStorage (там только id) — чтобы расчёт ниже был
 * ОДИН на оба случая. Раньше расчёт умел работать только с документом, и
 * гостевая корзина неизбежно завела бы вторую, расходящуюся копию правил.
 */
interface ResolvedEntry {
	product: Product;
	quantity: number;
	addedAt: string;
}

/** Товар остаётся в корзине, только пока он опубликован и продаётся. */
function isPurchasable(product: Product): boolean {
	const status = product.inventory?.status ?? "available";
	const isVisible = product.inventory?.isVisible ?? true;
	return isVisible && ["available", "preorder"].includes(status);
}

/**
 * Единственное место, где из набора «товар + количество» получается всё, что
 * нужно интерфейсу: нормализованные карточки, цены по позициям, скидка
 * корзины и проверка минимальных партий.
 */
async function composeCartView(
	entries: ResolvedEntry[],
	unavailable: CartUnavailableItem[],
	updatedAt: string | null,
): Promise<CartView> {
	const items: CartItemView[] = [];
	const issues: CartValidationIssue[] = [];
	let priceWithoutDiscount = 0;
	let priceAfterProductDiscounts = 0;
	let totalQuantity = 0;

	for (const entry of entries) {
		const cardData = mapProductToCardData(entry.product);
		const quantity = entry.quantity;
		const { finalPrice } = calculatePriceBreakdown(
			cardData.priceForIndividual,
			cardData.discount,
		);

		const subtotalWithoutDiscount = roundMoney(
			cardData.priceForIndividual * quantity,
		);
		const subtotal = roundMoney(finalPrice * quantity);
		const itemDiscount = roundMoney(subtotalWithoutDiscount - subtotal);

		priceWithoutDiscount = roundMoney(
			priceWithoutDiscount + subtotalWithoutDiscount,
		);
		priceAfterProductDiscounts = roundMoney(
			priceAfterProductDiscounts + subtotal,
		);
		totalQuantity += quantity;

		if (cardData.minOrderQuantity && quantity < cardData.minOrderQuantity) {
			issues.push({
				productId: cardData.id,
				productTitle: cardData.title,
				currentQuantity: quantity,
				minOrderQuantity: cardData.minOrderQuantity,
				message: `Минимальная партия — ${cardData.minOrderQuantity} шт.`,
			});
		}

		items.push({
			product: cardData,
			quantity,
			addedAt: entry.addedAt,
			unitPrice: cardData.priceForIndividual,
			unitFinalPrice: finalPrice,
			subtotal,
			subtotalWithoutDiscount,
			itemDiscount,
		});
	}

	const { applied, hints } = await getApplicableDiscount({
		totalAmount: priceAfterProductDiscounts,
		totalQuantity,
	});

	const centralDiscountAmount = applied?.discountAmount ?? 0;
	const totalPrice = roundMoney(
		priceAfterProductDiscounts - centralDiscountAmount,
	);
	const productDiscountAmount = roundMoney(
		priceWithoutDiscount - priceAfterProductDiscounts,
	);
	const totalDiscount = roundMoney(
		productDiscountAmount + centralDiscountAmount,
	);

	const summary: CartSummary = {
		totalItems: totalQuantity,
		itemsCount: items.length,
		priceWithoutDiscount,
		productDiscountAmount,
		centralDiscountAmount,
		centralDiscountPercent: applied?.discountPercent ?? 0,
		totalDiscount,
		totalPrice,
	};

	return {
		items,
		summary,
		validation: { isValid: issues.length === 0, issues },
		discounts: {
			applied: applied
				? [
						{
							id: String(applied.discount.id),
							name: applied.discount.name,
							discountPercent: applied.discountPercent,
							amount: applied.discountAmount,
							message: applied.message,
						},
					]
				: [],
			hints: hints.map((h) => ({
				message: h.message,
				discountPercent: h.discountPercent,
				needed: h.needed,
				current: h.current,
			})),
		},
		unavailable,
		updatedAt,
	};
}

/**
 * Cart -> CartView. Товары приходят уже загруженными (getCartByUserId ходит
 * с depth: 2), поэтому здесь нет ни одного дополнительного запроса.
 *
 * Снятые с продажи позиции не выбрасываются молча, как раньше: они выносятся
 * в `unavailable`, и корзина может честно сказать, что товара больше нет.
 * Из расчёта они по-прежнему исключены — заказать их нельзя.
 */
export async function buildCartView(cart: Cart | null): Promise<CartView> {
	const rawItems = cart?.items ?? [];

	const entries: ResolvedEntry[] = [];
	const unavailable: CartUnavailableItem[] = [];

	for (const raw of rawItems) {
		if (!isPopulatedProduct(raw.product)) continue;
		const product = raw.product;

		if (!isPurchasable(product)) {
			unavailable.push({
				productId: String(product.id),
				title: product.title,
				reason: "unavailable",
			});
			continue;
		}

		entries.push({
			product,
			quantity: raw.quantity,
			addedAt: raw.addedAt ?? new Date().toISOString(),
		});
	}

	return composeCartView(entries, unavailable, cart?.updatedAt ?? null);
}

/**
 * Тот же расчёт, но для списка «id + количество» — то есть для гостевой
 * корзины, которая живёт в localStorage и никакого документа Payload за собой
 * не имеет.
 *
 * Товары запрашиваются одним запросом по списку id (`ids`), а не по одному:
 * корзина на 10 позиций иначе стоила бы 10 обращений к базе. Порядок
 * результата задаёт клиент (сначала добавленное позже), поэтому строки
 * раскладываются по исходному порядку entries, а не по порядку ответа.
 */
export async function buildCartViewFromEntries(
	entries: CartEntry[],
): Promise<CartView> {
	if (entries.length === 0) return EMPTY_CART_VIEW;

	const ids = entries.map((entry) => entry.productId);
	const { docs } = await getCachedProducts({
		ids,
		limit: ids.length,
		depth: 1,
	});
	const byId = new Map(docs.map((product) => [String(product.id), product]));

	const resolved: ResolvedEntry[] = [];
	const unavailable: CartUnavailableItem[] = [];

	for (const entry of entries) {
		const product = byId.get(entry.productId);

		// Товара нет в выдаче — он снят с публикации или удалён. Названия у нас
		// в этом случае нет вовсе, поэтому позиция помечается как исчезнувшая:
		// интерфейс скажет «товар больше не продаётся», не выдумывая имя.
		if (!product) {
			unavailable.push({
				productId: entry.productId,
				title: null,
				reason: "gone",
			});
			continue;
		}

		if (!isPurchasable(product)) {
			unavailable.push({
				productId: entry.productId,
				title: product.title,
				reason: "unavailable",
			});
			continue;
		}

		resolved.push({
			product,
			quantity: entry.quantity,
			addedAt: entry.addedAt ?? new Date().toISOString(),
		});
	}

	return composeCartView(resolved, unavailable, null);
}
