import { NextRequest, NextResponse } from "next/server";
import type { ProductQuery } from "@/modules/productCard/types/query";
import type { ProductsPageResponse } from "@/modules/productCatalog/types/filters";
import { getCatalogData } from "@/payload/services/products.service";

// Payload Local API требует Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

// Значения синхронизированы с полем inventory.status коллекции products и с
// SORT_FIELD_PATHS в products.service.ts (там же — трансляция в реальный путь
// поля). Всё, чего нет в этих списках, отбрасывается.
const ALLOWED_STATUSES = [
	"available",
	"preorder",
	"out_of_stock",
	"discontinued",
] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

const ALLOWED_SORTS = [
	"createdAt",
	"price",
	"title",
	"viewsCount",
	"purchasesCount",
];

/**
 * GET /api/catalog/products?categoryId=...&cursor=<page>&limit=<n>&status=...&sort=...&order=...&priceFrom=...&priceTo=...
 *
 * Подгрузка страниц каталога категории для infinite scroll на клиенте.
 * Первая страница приходит с сервера вместе с самим page.tsx категории —
 * этот роут обслуживает только вторую и последующие (см.
 * useProductsInfiniteQuery).
 */
export async function GET(
	req: NextRequest,
): Promise<NextResponse<ProductsPageResponse | { error: string }>> {
	const params = req.nextUrl.searchParams;
	const categoryId = params.get("categoryId");

	if (!categoryId) {
		return NextResponse.json(
			{ error: "categoryId обязателен" },
			{ status: 400 },
		);
	}

	const cursorParam = Number(params.get("cursor") ?? "1");
	const page =
		Number.isFinite(cursorParam) && cursorParam > 0
			? Math.floor(cursorParam)
			: 1;

	const limitParam = Number(params.get("limit") ?? String(DEFAULT_LIMIT));
	const limit = Math.min(
		MAX_LIMIT,
		Number.isFinite(limitParam) && limitParam > 0
			? Math.floor(limitParam)
			: DEFAULT_LIMIT,
	);

	// status/sort/order приходят из query-строки и раньше уходили в сервис
	// как есть (status — прямым `as`). Сам Payload от этого не страдал, но
	// произвольные значения попадали в ключ кэша каталога (unstable_cache с
	// revalidate: false), то есть любой желающий мог бесконечно плодить записи
	// Data Cache простым перебором параметра. Принимаем только известные
	// значения, неизвестное — считаем «не задано».
	const statusParam = params.get("status");
	const status =
		statusParam && ALLOWED_STATUSES.includes(statusParam as AllowedStatus)
			? (statusParam as ProductQuery["status"])
			: undefined;

	const sortParam = params.get("sort");
	const sort =
		sortParam && ALLOWED_SORTS.includes(sortParam) ? sortParam : undefined;

	const orderParam = params.get("order");
	const order = orderParam === "asc" || orderParam === "desc" ? orderParam : undefined;

	const priceFrom = params.get("priceFrom");
	const priceTo = params.get("priceTo");

	const query: ProductQuery = {
		categoryId,
		isVisible: true,
		status,
		sort,
		order,
		priceFrom: priceFrom ? Number(priceFrom) : undefined,
		priceTo: priceTo ? Number(priceTo) : undefined,
		page,
		limit,
	};

	try {
		const result = await getCatalogData(query);
		return NextResponse.json({
			...result,
			nextCursor: result.pagination.hasNextPage ? page + 1 : null,
		});
	} catch (error) {
		console.error("[api/products] Unexpected error:", error);
		return NextResponse.json(
			{ error: "Не удалось загрузить товары" },
			{ status: 500 },
		);
	}
}
