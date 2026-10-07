import { unstable_cache } from "next/cache";
import type { Where } from "payload";
import type { Product } from "../../../payload-types";
import { env } from "../../env";
import {
	mapProductToCardData,
	ProductCardData,
} from "../../modules/productCard";
import { ProductQuery } from "../../modules/productCard/types/query";
import { EMPTY_FACET_SELECTION } from "../../modules/productCatalog/lib/facetParams";
import type {
	CatalogFacets,
	ProductCatalogResult,
	SortField,
} from "../../modules/productCatalog/types/filters";
import { ORDERABLE_PRODUCT_STATUSES } from "../utils/product-availability";
import {
	type CatalogQueryContext,
	type CategoryFacetDefinitions,
	getCatalogFacets,
	getCategoryFacetDefinitions,
	isSimpleContext,
	MAX_CACHED_PAGE,
	queryCatalogProductIds,
	sanitizeFacetSelection,
} from "./catalog-facets.service";
import { getPayloadInstance } from "./getPayload";

/**
 * Превращает список Payload-товаров в карточки. Рейтинг берётся из
 * денормализованных analytics.ratingAverage/reviewsCount (см.
 * product-rating.db.ts): они обновляются в транзакции одобрения отзыва, а кэш
 * товаров сбрасывается тем же хуком, так что свежий отзыв виден сразу — и без
 * отдельного запроса к отзывам на каждую страницу выдачи.
 */
export function mapProductsToCardsWithRating(
	docs: Product[],
): ProductCardData[] {
	return docs.map((doc) =>
		mapProductToCardData(doc, {
			average: doc.analytics?.ratingAverage ?? 0,
			count: doc.analytics?.reviewsCount ?? 0,
		}),
	);
}

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
		ids,
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
	// `ids` обязан входить в ключ. Пока его здесь не было, ЛЮБЫЕ две выборки
	// по списку id с прочими одинаковыми параметрами делили одну запись кэша:
	// блок «с этим товаром покупают» на второй карточке отдавал товары первой
	// (см. get-related-products.ts), а корзина показала бы чужие позиции.
	// Сортировка — чтобы один и тот же набор в разном порядке не заводил две
	// записи: порядок выдачи вызывающая сторона всё равно задаёт сама.
	const idsKey = ids && ids.length > 0 ? [...ids].sort().join(".") : "any";
	return `products-ids-${idsKey}-cat-${category || "any"}-st-${status || "any"}-vis-${isVisible ?? "any"}-main-${showOnMainPage ?? "any"}-pmin-${minPrice ?? "any"}-pmax-${maxPrice ?? "any"}-sort-${sort || "title"}-l-${limit || 100}-p-${page || 1}-d-${depth ?? 1}`;
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

const SORT_FIELDS: SortField[] = [
	"createdAt",
	"price",
	"title",
	"viewsCount",
	"purchasesCount",
	"rating",
];

/**
 * Сортировки по счётчикам популярности. Счётчики растут прямым UPDATE мимо
 * хуков (см. product-counters.db.ts) и тег `products` не сбрасывают — иначе
 * каждый просмотр стирал бы весь кэш каталога. Поэтому такая выдача
 * обновляется по таймеру: порядок «популярных» отстаёт от счётчика не больше
 * чем на этот срок, а прочие сортировки остаются вечными до правки товара.
 */
const COUNTER_SORT_FIELDS: ReadonlySet<SortField> = new Set([
	"viewsCount",
	"purchasesCount",
]);
const COUNTER_SORT_REVALIDATE_SECONDS = 15 * 60;

/** Контекст выдачи раздела: фасеты сверены с разделом (sanitize). */
function buildCatalogContext(
	query: ProductQuery,
	defs: CategoryFacetDefinitions,
): CatalogQueryContext {
	return {
		categoryId: Number(query.categoryId),
		status: query.status,
		priceFrom: query.priceFrom,
		priceTo: query.priceTo,
		selection: sanitizeFacetSelection(
			query.facets ?? EMPTY_FACET_SELECTION,
			defs,
		),
	};
}

/**
 * Документы по id в заданном порядке. Условие публикации повторено и здесь:
 * между выборкой id и этой выборкой товар могли снять с публикации.
 */
async function fetchProductsByIds(ids: number[]): Promise<Product[]> {
	if (ids.length === 0) return [];
	const payload = await getPayloadInstance();
	const { docs } = await payload.find({
		collection: "products",
		where: { and: [PUBLISHED_ONLY, { id: { in: ids } }] },
		depth: 1,
		limit: ids.length,
		pagination: false,
	});
	const byId = new Map(
		(docs as unknown as Product[]).map((doc) => [Number(doc.id), doc]),
	);
	return ids
		.map((id) => byId.get(id))
		.filter((doc): doc is Product => doc !== undefined);
}

/**
 * Страница выдачи раздела.
 *
 * Отбор, сортировка и пагинация — одним SQL-запросом по нормализованным
 * данным (catalog-facets.service): фасеты по характеристикам (И между
 * характеристиками одной строки товара) через where Payload не выражаются, а
 * сортировка по рейтингу обязана выполняться ДО пагинации. Документы затем
 * подтягиваются обычным payload.find по id страницы.
 */
/**
 * Карточки для блока «Продукция» на главной.
 *
 * Отдельная выборка, а не getCatalogData: тот работает только внутри раздела
 * каталога (фасеты, счётчики) и без categoryId отдаёт пустой результат —
 * именно так блок на главной опустел после перевода каталога на фасеты.
 *
 * Порядок:
 *  1. товары с флагом «Показывать на главной» (inventory.showOnMainPage) —
 *     выбор администратора, новые первыми;
 *  2. если их меньше `limit`, блок добирается самыми новыми товарами, которые
 *     можно заказать прямо сейчас. Раньше флаг молча не учитывался вовсе, и
 *     главная показывала просто новинки; без добора блок снова опустел бы
 *     там, где флаг ещё никому не проставлен.
 *
 * Обе выборки — через getCachedProducts: кэш с тегом `products`, сбрасывается
 * хуком коллекции, как и раньше.
 */
export async function getHomeShowcaseProducts(
	limit = 10,
): Promise<ProductCardData[]> {
	const featured = await getCachedProducts({
		showOnMainPage: true,
		isVisible: true,
		sort: "-createdAt",
		limit,
		depth: 1,
	});
	const docs = [...featured.docs];

	// Добор — сначала «в наличии», затем «предзаказ»: в витрине первыми
	// должны стоять товары, которые можно получить сразу.
	if (docs.length < limit) {
		const seen = new Set(docs.map((doc) => String(doc.id)));
		for (const status of ORDERABLE_PRODUCT_STATUSES) {
			if (docs.length >= limit) break;
			const fill = await getCachedProducts({
				status,
				isVisible: true,
				sort: "-createdAt",
				// С запасом на уже взятые избранные — они могут попасть и сюда.
				limit: limit + seen.size,
				depth: 1,
			});
			for (const doc of fill.docs) {
				if (docs.length >= limit) break;
				if (seen.has(String(doc.id))) continue;
				seen.add(String(doc.id));
				docs.push(doc);
			}
		}
	}

	return mapProductsToCardsWithRating(docs);
}

export async function getCatalogData(
	query: ProductQuery,
): Promise<ProductCatalogResult> {
	const limit = query.limit || 24;
	const page = query.page || 1;
	const field = SORT_FIELDS.includes(query.sort as SortField)
		? (query.sort as SortField)
		: "createdAt";
	const order = query.order === "asc" ? "asc" : "desc";

	const categoryId = Number(query.categoryId);
	const empty: ProductCatalogResult = {
		products: [],
		totalDocs: 0,
		pagination: {
			page,
			limit,
			totalPages: 0,
			hasNextPage: false,
			hasPrevPage: page > 1,
		},
	};
	if (!Number.isInteger(categoryId) || categoryId <= 0) return empty;

	const defs = await getCategoryFacetDefinitions(categoryId);
	const ctx = buildCatalogContext(query, defs);

	const fetchFn = async (): Promise<ProductCatalogResult> => {
		const { ids, total } = await queryCatalogProductIds(
			ctx,
			defs,
			{ field, order },
			page,
			limit,
		);
		const totalPages = Math.ceil(total / limit);
		return {
			products: mapProductsToCardsWithRating(await fetchProductsByIds(ids)),
			totalDocs: total,
			pagination: {
				page,
				limit,
				totalPages,
				hasNextPage: page < totalPages,
				hasPrevPage: page > 1,
			},
		};
	};

	// В кэш — только выдача без фасетов и цены и только первые страницы:
	// число таких вариантов конечно (раздел × наличие × сортировка ×
	// страница). Остальное считается запросом к базе — см. шапку
	// catalog-facets.service.ts.
	if (
		env.NODE_ENV === "development" ||
		!isSimpleContext(ctx) ||
		page > MAX_CACHED_PAGE
	) {
		return fetchFn();
	}
	return unstable_cache(
		fetchFn,
		[
			`catalog-page-${categoryId}-st-${ctx.status ?? "any"}-${field}-${order}-l-${limit}-p-${page}`,
		],
		{
			tags: ["products", "catalog-facets"],
			revalidate: COUNTER_SORT_FIELDS.has(field)
				? COUNTER_SORT_REVALIDATE_SECONDS
				: false,
		},
	)();
}

/** Фасеты раздела со счётчиками под текущий выбор. */
export async function getCatalogFacetsData(
	query: ProductQuery,
): Promise<CatalogFacets> {
	const categoryId = Number(query.categoryId);
	if (!Number.isInteger(categoryId) || categoryId <= 0) {
		return { manufacturers: [], discount: null, specs: [] };
	}
	const defs = await getCategoryFacetDefinitions(categoryId);
	return getCatalogFacets(buildCatalogContext(query, defs), defs);
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

/**
 * Число видимых позиций в каждом разделе каталога: ключ — id категории
 * строкой, значение — количество товаров.
 *
 * Один запрос на весь каталог, а не payload.count на каждую категорию:
 * разделов два десятка, и поштучный подсчёт превратился бы в два десятка
 * обращений к базе на каждую отрисовку витрины каталога. Выбирается ровно
 * одно поле (select) при depth 0 — из базы приезжают пары id-категории, а не
 * документы товаров.
 *
 * Условия те же, что у выдачи раздела (buildProductWhere с isVisible), иначе
 * подпись на карточке обещала бы позиции, которых на странице раздела нет:
 * черновики и снятые с продажи в счёт не идут.
 */
async function fetchCategoryProductCounts(): Promise<Record<string, number>> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "products",
		where: buildProductWhere({ isVisible: true }),
		depth: 0,
		pagination: false,
		select: { category: true },
	});

	const counts: Record<string, number> = {};
	for (const doc of result.docs) {
		// depth: 0 отдаёт связь числом, но в типах она остаётся объединением —
		// разбираем оба случая, чтобы смена depth не ломала подсчёт молча.
		const relation = (doc as { category?: number | { id: number } | null })
			.category;
		const id = typeof relation === "object" ? relation?.id : relation;
		if (id === null || id === undefined) continue;
		const key = String(id);
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

export const getCachedCategoryProductCounts = () => {
	if (env.NODE_ENV === "development") {
		return fetchCategoryProductCounts();
	}
	return unstable_cache(
		fetchCategoryProductCounts,
		["category-product-counts"],
		{
			tags: ["products"],
			revalidate: false,
		},
	)();
};

/**
 * Товар в превью раздела — для меню каталога в шапке.
 */
export interface CategoryPreviewProduct {
	id: string;
	title: string;
	slug: string;
	imageUrl: string | null;
	imageAlt: string;
	priceForIndividual: number;
	discount: Product["pricing"]["discount"];
}

/** Сколько товаров показывает меню на раздел. */
const PREVIEWS_PER_CATEGORY = 3;

function previewImage(images: Product["images"]): {
	url: string | null;
	alt: string;
} {
	const first = images?.find(
		(image): image is Exclude<typeof image, number> =>
			typeof image === "object" && image !== null && Boolean(image.url),
	);
	if (!first) return { url: null, alt: "" };
	// Миниатюра 400×300 — ровно под плитку меню; оригинал весил бы в десятки
	// раз больше, а плиток на экране шесть и больше.
	return {
		url: first.sizes?.thumbnail?.url || first.url || null,
		alt: first.alt ?? "",
	};
}

/**
 * Несколько товаров каждого раздела — ключ id категории строкой.
 *
 * Одна выборка на весь каталог, как у счётчиков выше: шапка рисуется на
 * каждой странице, и запрос на раздел превратился бы в десяток обращений к
 * базе на каждый переход. Поля ограничены select — из базы приезжает только
 * то, что меню показывает.
 *
 * Внутри раздела сначала идут товары с фотографией: меню продаёт разделы
 * картинкой, и плитка-заглушка на первом месте работала бы против него.
 * Условия видимости — те же, что у выдачи раздела.
 */
async function fetchCategoryPreviews(): Promise<
	Record<string, CategoryPreviewProduct[]>
> {
	const payload = await getPayloadInstance();
	const result = await payload.find({
		collection: "products",
		where: buildProductWhere({ isVisible: true }),
		depth: 1,
		pagination: false,
		sort: "title",
		select: {
			title: true,
			slug: true,
			category: true,
			images: true,
			pricing: true,
		},
	});

	const grouped: Record<string, CategoryPreviewProduct[]> = {};
	for (const doc of result.docs as unknown as Product[]) {
		const relation = doc.category as number | { id: number } | null;
		const categoryId = typeof relation === "object" ? relation?.id : relation;
		if (categoryId === null || categoryId === undefined) continue;

		const image = previewImage(doc.images);
		const key = String(categoryId);
		grouped[key] ??= [];
		grouped[key].push({
			id: String(doc.id),
			title: doc.title,
			slug: doc.slug ?? String(doc.id),
			imageUrl: image.url,
			imageAlt: image.alt,
			priceForIndividual: doc.pricing?.priceForIndividual ?? 0,
			discount: doc.pricing?.discount,
		});
	}

	for (const key of Object.keys(grouped)) {
		grouped[key] = grouped[key]
			.sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)))
			.slice(0, PREVIEWS_PER_CATEGORY);
	}
	return grouped;
}

export const getCachedCategoryPreviews = () => {
	if (env.NODE_ENV === "development") {
		return fetchCategoryPreviews();
	}
	return unstable_cache(fetchCategoryPreviews, ["category-previews"], {
		tags: ["products"],
		revalidate: false,
	})();
};
