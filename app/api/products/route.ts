import { NextRequest, NextResponse } from "next/server";
import type { ProductQuery } from "@/modules/productCard/types/query";
import type { ProductsPageResponse } from "@/modules/productCatalog/types/filters";
import { getCatalogData } from "@/payload/services/products.service";

// Payload Local API требует Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

/**
 * GET /api/products?categoryId=...&cursor=<page>&limit=<n>&status=...&sort=...&order=...&priceFrom=...&priceTo=...
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

	const status = params.get("status");
	const sort = params.get("sort") ?? undefined;
	const order = params.get("order") as "asc" | "desc" | null;
	const priceFrom = params.get("priceFrom");
	const priceTo = params.get("priceTo");

	const query: ProductQuery = {
		categoryId,
		isVisible: true,
		status:
			status && status !== "all"
				? (status as ProductQuery["status"])
				: undefined,
		sort,
		order: order ?? undefined,
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
