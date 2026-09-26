import { getImageData } from "@/modules/category/lib/media";
import { mapDiscountPercentage } from "@/modules/productCard/lib/adapter";
import { calculatePriceBreakdown } from "@/modules/productCard/lib/pricing";
import { getProductHref } from "@/modules/productCard/lib/routing";
import type { CategoryPreviewProduct } from "@/payload/services/products.service";
import type { Category } from "@/payload-types";

/**
 * Данные меню каталога в шапке.
 *
 * Собираются на сервере (Navbar) из трёх уже кэшированных выборок —
 * разделы, счётчики, превью товаров — и уезжают в клиентский остров плоскими
 * сериализуемыми объектами: меню не знает ни о Payload, ни о правилах скидок.
 */

export interface CatalogMenuProduct {
	id: string;
	title: string;
	href: string;
	image: { url: string; alt: string } | null;
	price: number;
	/** Цена до скидки — только если скидка есть. */
	oldPrice: number | null;
}

export interface CatalogMenuSection {
	id: string;
	name: string;
	href: string;
	subtitle: string | null;
	image: { url: string; alt: string } | null;
	count: number;
	products: CatalogMenuProduct[];
}

export interface CatalogMenuData {
	sections: CatalogMenuSection[];
	totalProducts: number;
}

function mapProduct(
	product: CategoryPreviewProduct,
	categorySlug: string,
): CatalogMenuProduct {
	const discount = mapDiscountPercentage(
		product.discount,
		product.priceForIndividual,
	);
	const { finalPrice, hasDiscount } = calculatePriceBreakdown(
		product.priceForIndividual,
		discount,
	);

	return {
		id: product.id,
		title: product.title,
		href: getProductHref(
			{ id: product.id, slug: product.slug, category: null },
			categorySlug,
		),
		image: product.imageUrl
			? { url: product.imageUrl, alt: product.imageAlt || product.title }
			: null,
		price: finalPrice,
		oldPrice: hasDiscount ? product.priceForIndividual : null,
	};
}

export function buildCatalogMenu(
	categories: Category[],
	counts: Record<string, number>,
	previews: Record<string, CategoryPreviewProduct[]>,
): CatalogMenuData {
	const sections = categories.map((category) => {
		const key = String(category.id);
		return {
			id: key,
			name: category.name,
			href: `/category/${category.slug}`,
			subtitle: category.subtitle?.trim() || null,
			image: getImageData(category.image),
			count: counts[key] ?? 0,
			products: (previews[key] ?? []).map((product) =>
				mapProduct(product, category.slug),
			),
		};
	});

	return {
		sections,
		totalProducts: sections.reduce((sum, section) => sum + section.count, 0),
	};
}
