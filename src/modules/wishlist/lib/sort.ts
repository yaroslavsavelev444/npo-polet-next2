import { calculatePriceBreakdown } from "@/modules/productCard/lib/pricing";
import type { WishlistItemView } from "../types";

/**
 * Порядок показа избранного.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ СОРТИРОВКА ЕСТЬ, А ФИЛЬТРОВ НЕТ
 * ────────────────────────────────────────────────────────────────────────────
 * Избранное копится месяцами и лежит без всякого порядка, кроме порядка
 * добавления. «Сначала новые» отвечает на «что я отложил недавно», «сначала
 * дешёвые» — на «с чего начать», «по названию» — на «где здесь тот самый».
 * Все три вопроса на этой странице настоящие.
 *
 * Фильтров при этом нет намеренно. Отложенных позиций обычно единицы, и набор
 * вкладок над сеткой из шести карточек превратил бы личный раздел в урезанный
 * каталог — ровно то, чем страница быть не должна. Наличие и скидка уже
 * видны на самой карточке, а сколько позиций в наличии, сказано в первом
 * экране.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ПОЧЕМУ НА КЛИЕНТЕ
 * ────────────────────────────────────────────────────────────────────────────
 * Избранное приходит одним документом целиком — постраничной навигации у него
 * нет и быть не может (список личный и короткий). Значит, все данные уже в
 * памяти вкладки, и порядок меняется мгновенно, без обращения к серверу. Этим
 * страница отличается от заказов и отзывов, где отбор серверный, потому что
 * записей сотни.
 *
 * Порядок НЕ пишется в адрес: избранное — не выдача, которой делятся ссылкой,
 * а личный список. Параметр в адресе здесь был бы мусором в истории браузера.
 */

export type WishlistSortValue =
	| "added-desc"
	| "added-asc"
	| "price-asc"
	| "price-desc"
	| "title-asc";

export interface WishlistSortOption {
	value: WishlistSortValue;
	label: string;
}

export const WISHLIST_SORT_OPTIONS: WishlistSortOption[] = [
	{ value: "added-desc", label: "Сначала новые" },
	{ value: "added-asc", label: "Сначала старые" },
	{ value: "price-asc", label: "Сначала дешёвые" },
	{ value: "price-desc", label: "Сначала дорогие" },
	{ value: "title-asc", label: "По названию" },
];

export const DEFAULT_WISHLIST_SORT: WishlistSortValue = "added-desc";

export function findWishlistSortOption(
	value: WishlistSortValue,
): WishlistSortOption {
	return (
		WISHLIST_SORT_OPTIONS.find((option) => option.value === value) ??
		WISHLIST_SORT_OPTIONS[0]
	);
}

/**
 * Цена, по которой сортируем, — ИТОГОВАЯ, со скидкой. Та же, что напечатана
 * на карточке: сортировать по зачёркнутой значило бы расставить товары в
 * порядке, которого на экране не видно.
 */
function finalPriceOf(item: WishlistItemView): number {
	return calculatePriceBreakdown(
		item.product.priceForIndividual,
		item.product.discount,
	).finalPrice;
}

function addedAtOf(item: WishlistItemView): number {
	const time = Date.parse(item.addedAt);
	// Неразобранная дата не должна выкидывать позицию в начало или конец
	// списка: считаем её самой старой и оставляем внизу «новых».
	return Number.isNaN(time) ? 0 : time;
}

/**
 * Сравнение названий — через Intl: «Ё» и регистр в русском алфавите иначе
 * встают не туда, а артикулы вида «СМ-200» сравниваются по числам, а не по
 * знакам («СМ-2» перед «СМ-10»).
 */
const collator = new Intl.Collator("ru", {
	numeric: true,
	sensitivity: "base",
});

export function sortWishlistItems(
	items: WishlistItemView[],
	sort: WishlistSortValue,
): WishlistItemView[] {
	const sorted = [...items];

	switch (sort) {
		case "added-asc":
			sorted.sort((a, b) => addedAtOf(a) - addedAtOf(b));
			break;
		case "price-asc":
			sorted.sort((a, b) => finalPriceOf(a) - finalPriceOf(b));
			break;
		case "price-desc":
			sorted.sort((a, b) => finalPriceOf(b) - finalPriceOf(a));
			break;
		case "title-asc":
			sorted.sort((a, b) => collator.compare(a.product.title, b.product.title));
			break;
		default:
			sorted.sort((a, b) => addedAtOf(b) - addedAtOf(a));
			break;
	}

	return sorted;
}
