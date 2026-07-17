import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { Product } from "../../../payload-types";
import { env } from "../../env";
import {
	mapProductToCardData,
	ProductCardData,
} from "../../modules/productCard";
import { ProductQuery } from "../../modules/productCard/types/query";
import { ProductCatalogResult } from "../../modules/productCatalog/types/filters";
import { getPayloadInstance } from "./getPayload";

export interface GetProductsOptions {
	ids?: string[]; // добавить

	category?: string;
	status?: "available" | "preorder" | "out_of_stock" | "discontinued";
	isVisible?: boolean;
	showOnMainPage?: boolean;
	minPrice?: number;
	maxPrice?: number;
	sort?: string;
	limit?: number;
	page?: number;
	depth?: number;
}

// У коллекции products включено versions.drafts, а payload.find без явного
// фильтра возвращает документы независимо от статуса — то есть на витрину
// (и в sitemap) попадали неопубликованные черновики, полностью открытые
// анонимному посетителю. inventory.isVisible это не закрывал: он про «убрать
// из продажи», а не про «ещё не готово к публикации».
//
// Условие обязано быть во ВСЕХ выборках витрины. Поиск
// (search.service.ts) и ссылки в заказах (modules/orders/lib/order-line-item.ts,
// isProductArchived) статус уважали и раньше — каталог с карточкой были
// единственными, кто выбивался.
const PUBLISHED_ONLY = { _status: { equals: "published" } } as const;

export function buildProductWhere(options: GetProductsOptions): Where {
	const where: Where = {};
	const conditions: Where[] = [PUBLISHED_ONLY];

	if (options.category) {
		conditions.push({ category: { equals: options.category } });
	}
	if (options.ids && options.ids.length > 0) {
		conditions.push({ id: { in: options.ids } });
	}

	if (options.status) {
		conditions.push({ "inventory.status": { equals: options.status } });
	}
	if (options.isVisible !== undefined) {
		conditions.push({
			"inventory.isVisible": {
				equals: options.isVisible,
			},
		});
	}
	if (options.showOnMainPage !== undefined) {
		conditions.push({
			"inventory.showOnMainPage": {
				equals: options.showOnMainPage,
			},
		});
	}
	if (options.minPrice !== undefined) {
		conditions.push({
			"pricing.priceForIndividual": { greater_than_equal: options.minPrice },
		});
	}
	if (options.maxPrice !== undefined) {
		conditions.push({
			"pricing.priceForIndividual": { less_than_equal: options.maxPrice },
		});
	}

	if (conditions.length > 0) {
		where.and = conditions;
	}
	return where;
}

function getProductsCacheKey(options?: GetProductsOptions): string {
	const {
		category,
		status,
		isVisible,
		showOnMainPage,
		minPrice,
		maxPrice,

		sort,
		limit,
		page,
		depth,
	} = options || {};
	return `products-cat-${category || "any"}-st-${status || "any"}-vis-${isVisible ?? "any"}-main-${showOnMainPage ?? "any"}-pmin-${minPrice ?? "any"}-pmax-${maxPrice ?? "any"}-sort-${sort || "title"}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`;
}

async function fetchProducts(options: GetProductsOptions = {}) {
	const payload = await getPayloadInstance();
	const where = buildProductWhere(options); // исправлено имя функции
	const result = await payload.find({
		collection: "products",
		where,
		sort: options.sort || "title",
		limit: options.limit || 100,
		page: options.page || 1,
		depth: options.depth ?? 1,
	});
	return {
		docs: result.docs as unknown as Product[],
		totalDocs: result.totalDocs,
	};
}

export const getCachedProducts = (options?: GetProductsOptions) => {
	const fetchFn = () => fetchProducts(options);
	if (env.NODE_ENV === "development") {
		return fetchFn();
	}
	return unstable_cache(fetchFn, [getProductsCacheKey(options)], {
		tags: ["products"],
		revalidate: false,
	})();
};

async function fetchProductById(id: string): Promise<Product | null> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "products",
		where: { and: [PUBLISHED_ONLY, { id: { equals: id } }] },
		limit: 1,
		depth: 1,
	});
	return (result.docs[0] || null) as unknown as Product | null;
}

export const getCachedProductById = (id: string) => {
	const fetchFn = () => fetchProductById(id);
	if (env.NODE_ENV === "development") {
		return fetchFn();
	}
	return unstable_cache(fetchFn, [`product-${id}`], {
		tags: ["products"],
		revalidate: false,
	})();
};

async function fetchProductBySlug(slug: string): Promise<Product | null> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "products",
		where: { and: [PUBLISHED_ONLY, { slug: { equals: slug } }] },
		limit: 1,
		depth: 1,
	});
	return (result.docs[0] || null) as unknown as Product | null;
}

export const getCachedProductBySlug = (slug: string) => {
	const fetchFn = () => fetchProductBySlug(slug);
	if (env.NODE_ENV === "development") {
		return fetchFn();
	}
	return unstable_cache(fetchFn, [`product-slug-${slug}`], {
		tags: ["products"],
		revalidate: false,
	})();
};

// Ищет товар по прежнему slug (см. hooks/trackPreviousSlug.ts). Используется
// резолвером страницы товара ТОЛЬКО как fallback, когда прямой поиск по
// текущему slug ничего не нашёл — иначе уже проиндексированный старый URL
// (например, после исправления опечатки в названии) отдавал бы 404 вместо
// 301 на актуальный адрес.
async function fetchProductByPreviousSlug(
	slug: string,
): Promise<Product | null> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "products",
		where: {
			and: [PUBLISHED_ONLY, { "previousSlugs.slug": { equals: slug } }],
		},
		limit: 1,
		depth: 1,
	});
	return (result.docs[0] || null) as unknown as Product | null;
}

export const getCachedProductByPreviousSlug = (slug: string) => {
	const fetchFn = () => fetchProductByPreviousSlug(slug);
	if (env.NODE_ENV === "development") {
		return fetchFn();
	}
	return unstable_cache(fetchFn, [`product-prev-slug-${slug}`], {
		tags: ["products"],
		revalidate: false,
	})();
};

// Payload сортирует по реальному пути поля с префиксом "-" для убывания
// (см. src/payload/services/search.service.ts: "-analytics.viewsCount"), а не
// по синтаксису "field:order" — часть полей каталога вложена в группы,
// поэтому дружественное имя сортировки транслируется в реальный путь здесь.
const SORT_FIELD_PATHS: Record<string, string> = {
	createdAt: "createdAt",
	price: "pricing.priceForIndividual",
	title: "title",
	viewsCount: "analytics.viewsCount",
	purchasesCount: "analytics.purchasesCount",
};

function buildCatalogSort(sort?: string, order?: "asc" | "desc"): string {
	const field = SORT_FIELD_PATHS[sort || "createdAt"] || "createdAt";
	return order === "asc" ? field : `-${field}`;
}

export async function getCatalogData(
	query: ProductQuery,
): Promise<ProductCatalogResult> {
	const options: GetProductsOptions = {
		category: query.categoryId,
		isVisible: query.isVisible,
		status: query.status,
		minPrice: query.priceFrom,
		maxPrice: query.priceTo,
		sort: buildCatalogSort(query.sort, query.order),
		limit: query.limit || 24,
		page: query.page || 1,
		depth: 1,
	};

	const { docs, totalDocs } = await getCachedProducts(options);

	const totalPages = Math.ceil(totalDocs / (options.limit || 24));

	return {
		products: docs.map(mapProductToCardData),
		totalDocs,
		pagination: {
			page: options.page || 1,
			limit: options.limit || 24,
			totalPages,
			hasNextPage: (options.page || 1) < totalPages,
			hasPrevPage: (options.page || 1) > 1,
		},
	};
}

export interface CategoryPriceBounds {
	min: number;
	max: number;
}

// Границы для слайдера цены в фильтрах каталога — реальные min/max по видимым
// товарам категории (а не захардкоженный диапазон 0-100000, который либо
// душит дорогие категории, либо даёт бесполезный масштаб дешёвым).
// Игнорирует текущий priceFrom/priceTo, иначе диапазон слайдера будет
// схлопываться вслед за уже применённым фильтром.
async function fetchCategoryPriceBounds(
	categoryId: string,
): Promise<CategoryPriceBounds> {
	const baseOptions: GetProductsOptions = {
		category: categoryId,
		isVisible: true,
		limit: 1,
		depth: 0,
	};

	const [{ docs: cheapest }, { docs: priciest }] = await Promise.all([
		fetchProducts({ ...baseOptions, sort: "pricing.priceForIndividual" }),
		fetchProducts({ ...baseOptions, sort: "-pricing.priceForIndividual" }),
	]);

	const min = cheapest[0]?.pricing?.priceForIndividual ?? 0;
	const max = priciest[0]?.pricing?.priceForIndividual ?? min;

	return { min, max: Math.max(min, max) };
}

export const getCachedCategoryPriceBounds = (categoryId: string) => {
	const fetchFn = () => fetchCategoryPriceBounds(categoryId);
	if (env.NODE_ENV === "development") {
		return fetchFn();
	}
	return unstable_cache(fetchFn, [`products-price-bounds-${categoryId}`], {
		tags: ["products"],
		revalidate: false,
	})();
};
