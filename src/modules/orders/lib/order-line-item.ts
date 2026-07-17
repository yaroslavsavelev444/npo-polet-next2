import { getProductHref } from "@/modules/productCard";
import type { Category, Media, Order, Product } from "@/payload-types";

/**
 * Нормализованная позиция заказа для презентационных компонентов. Заказ хранит
 * снимок имени/цены на момент покупки, поэтому позиция остаётся корректной даже
 * если товар позже удалён или снят с продажи — тогда `isArchived === true`, а
 * `href === null` (карточку нельзя открыть).
 *
 * Общий тип для страницы успешного оформления и модалки просмотра заказа —
 * единый источник правды, чтобы карточка товара выглядела одинаково везде.
 */
export interface OrderLineItem {
	key: string;
	name: string;
	quantity: number;
	/** Цена за единицу до скидки. */
	unitOriginalPrice: number;
	/** Цена за единицу с учётом скидки. */
	unitFinalPrice: number;
	/** Итоговая стоимость позиции (со скидкой). */
	lineTotal: number;
	hasDiscount: boolean;
	imageUrl: string | null;
	imageAlt: string;
	/** Ссылка на карточку товара или `null`, если товар недоступен. */
	href: string | null;
	isArchived: boolean;
}

function isPopulatedProduct(
	value: number | Product | null | undefined,
): value is Product {
	return typeof value === "object" && value !== null;
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

function resolveImage(product: Product | null): {
	url: string | null;
	alt: string;
} {
	const fallbackAlt = product?.title ?? "Товар";
	const first = product?.images?.find(isPopulatedMedia);
	if (!first) return { url: null, alt: fallbackAlt };
	return { url: first.url ?? null, alt: first.alt || fallbackAlt };
}

/**
 * Товар считается недоступным (архивным), если связь не подтянулась (удалён),
 * снят с продажи или ещё не опубликован. `out_of_stock` намеренно не относим к
 * архивным — у такого товара сохраняется страница, куда можно перейти.
 */
function isProductArchived(product: Product | null): boolean {
	if (!product) return true;
	if (product._status && product._status !== "published") return true;
	if (product.inventory?.status === "discontinued") return true;
	return false;
}

function buildHref(product: Product | null): string | null {
	if (!product || isProductArchived(product)) return null;
	const category = product.category;
	return getProductHref({
		id: String(product.id),
		slug: product.slug ?? "",
		category: isPopulatedCategory(category)
			? {
					id: String(category.id),
					slug: category.slug ?? "",
					title: category.name,
				}
			: null,
	});
}

/** Нормализует позиции заказа в единый вид для карточек товаров. */
export function mapOrderLineItems(order: Order): OrderLineItem[] {
	const rawItems = order.items ?? [];

	return rawItems.map((item, index) => {
		const product = isPopulatedProduct(item.product) ? item.product : null;
		const quantity = Math.max(1, item.quantity);
		const unitOriginalPrice = item.unitPrice;
		const unitFinalPrice =
			quantity > 0 ? item.totalPrice / quantity : item.unitPrice;
		const lineDiscount = item.discount ?? 0;
		const { url, alt } = resolveImage(product);

		return {
			key: item.id ?? `${item.name}-${index}`,
			name: item.name,
			quantity: item.quantity,
			unitOriginalPrice,
			unitFinalPrice,
			lineTotal: item.totalPrice,
			hasDiscount: lineDiscount > 0 && unitFinalPrice < unitOriginalPrice,
			imageUrl: url,
			imageAlt: alt,
			href: buildHref(product),
			isArchived: isProductArchived(product),
		};
	});
}
