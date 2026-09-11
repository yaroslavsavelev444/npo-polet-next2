import type { Category } from "@/payload-types";
import type { CategoryCardData } from "../types/filters";
import { getImageData } from "./media";

/**
 * Документ Payload → данные карточки раздела.
 *
 * Здесь же собирается строка поиска: название, подпись, описание, slug и
 * ключевые слова из админки. Именно ключевые слова делают поиск полезным —
 * по «дрон» находится «Комплексы противодействия БПЛА», хотя в названии
 * такого слова нет.
 */
export function mapCategoryToCardData(
	category: Category,
	productCount = 0,
): CategoryCardData {
	const keywords =
		category.keywords
			?.map((item) => item.keyword)
			.filter((value): value is string => Boolean(value)) ?? [];

	const searchSource = [
		category.name,
		category.subtitle,
		category.description,
		category.slug,
		...keywords,
	].filter((value): value is string => typeof value === "string");

	return {
		id: String(category.id),
		name: category.name,
		slug: category.slug,
		href: `/category/${category.slug}`,
		subtitle: category.subtitle?.trim() || undefined,
		image: getImageData(category.image),
		productCount,
		order: category.order ?? 0,
		// Дата нужна только для сортировки — число сериализуется дешевле строки
		// и не требует разбора Date на каждое сравнение.
		createdAt: new Date(category.createdAt).getTime(),
		search: searchSource.join(" ").toLowerCase(),
	};
}
