"use client";

import { PackageSearch } from "lucide-react";
import { useEffect, useRef } from "react";
import { ProductGrid } from "@/modules/productCard/components/productGrid";
import { Empty, Spinner } from "@/UI";
import { useProductsInfiniteQuery } from "../hooks/useProductsInfiniteQuery";
import { pluralizeProducts } from "../lib/catalogOptions";
import type { CatalogFilters, ProductsPageResponse } from "../types/filters";

interface Props {
	categoryId: string;
	filters: CatalogFilters;
	initialPage: ProductsPageResponse;
}

/**
 * Владеет infinite scroll поверх уже готовой сетки карточек (ProductGrid из
 * productCard — не трогаем). Первая страница всегда из SSR (initialPage),
 * довычитка следующих идёт через IntersectionObserver-сентинел — тот же
 * приём, что и в src/modules/notifications/components/NotificationPanel.tsx.
 */
export function CatalogProductGrid({
	categoryId,
	filters,
	initialPage,
}: Props) {
	const {
		data,
		status,
		error,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
		refetch,
	} = useProductsInfiniteQuery({ categoryId, filters, initialPage });

	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !hasNextPage) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !isFetchingNextPage) {
					void fetchNextPage();
				}
			},
			{ rootMargin: "600px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const products =
		data?.pages.flatMap((page) => page.products) ?? initialPage.products;

	if (status === "error") {
		return (
			<div className="flex flex-col items-center gap-3 py-16 text-center">
				<p className="text-sm text-[var(--text-secondary)]">
					{error instanceof Error
						? error.message
						: "Не удалось загрузить товары"}
				</p>
				<button
					type="button"
					onClick={() => void refetch()}
					className="text-sm font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
				>
					Повторить
				</button>
			</div>
		);
	}

	if (products.length === 0) {
		return (
			<Empty
				size="lg"
				icon={
					<PackageSearch
						className="h-full w-full"
						strokeWidth={1.25}
						aria-hidden
					/>
				}
				message="Ничего не найдено"
				description="Попробуйте изменить фильтры или сбросить их — так вы увидите больше товаров"
				className="py-20"
			/>
		);
	}

	return (
		<div>
			<ProductGrid products={products} />

			{hasNextPage && (
				<div ref={sentinelRef} className="flex justify-center py-8">
					{isFetchingNextPage && (
						<Spinner size="md" label="Загружаем ещё товары" />
					)}
				</div>
			)}

			{!hasNextPage && products.length > 0 && (
				<p className="py-8 text-center text-sm text-[var(--text-muted)]">
					Показаны все {products.length} {pluralizeProducts(products.length)}
				</p>
			)}
		</div>
	);
}

export default CatalogProductGrid;
