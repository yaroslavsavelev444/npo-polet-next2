"use client";

import { PackageSearch } from "lucide-react";
import { useEffect, useRef } from "react";
import { ProductGrid } from "@/modules/productCard/components/productGrid";
import { Spinner } from "@/UI";
import { useProductFilters } from "../hooks/useProductFilters";
import { useProductsInfiniteQuery } from "../hooks/useProductsInfiniteQuery";
import { pluralizeProducts } from "../lib/catalogOptions";
import type { CatalogFilters, ProductsPageResponse } from "../types/filters";
import styles from "./Catalog.module.css";

interface Props {
	categoryId: string;
	filters: CatalogFilters;
	initialPage: ProductsPageResponse;
}

/**
 * Владеет infinite scroll поверх готовой сетки карточек. Первая страница
 * всегда из SSR (initialPage), довычитка следующих идёт через
 * IntersectionObserver-сентинел — тот же приём, что и в
 * src/modules/notifications/components/NotificationPanel.tsx.
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

	const { activeFiltersCount, resetFilters } = useProductFilters();
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
			<div className="flex flex-col items-center gap-3 py-[4rem] text-center">
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
			/* Пустая выдача набрана тем же голосом, что и остальной каталог:
			   служебная микроподпись, обычный заголовок, один выход. Прежний
			   компонент Empty приносил сюда крупную иллюстрацию-ящик и вторую
			   типографику — на странице, где всё остальное держится на
			   разлиновке, она читалась как заглушка из другого проекта. */
			<div className="flex flex-col items-center gap-4 border-y border-[var(--rule)] px-[1rem] py-[5rem] text-center">
				<PackageSearch
					size={28}
					strokeWidth={1.25}
					aria-hidden
					className="text-[var(--border-light)]"
				/>
				<div className="flex flex-col items-center gap-2">
					<p className="text-[1.0625rem] font-semibold text-[var(--text-primary)]">
						Ничего не найдено
					</p>
					<p className="max-w-[38ch] text-sm leading-relaxed text-[var(--text-secondary)]">
						{activeFiltersCount > 0
							? "Под выбранные фильтры не подошла ни одна позиция. Снимите их — и увидите весь раздел."
							: "В этом разделе пока нет товаров. Загляните в другие категории каталога."}
					</p>
				</div>
				{activeFiltersCount > 0 && (
					<button
						type="button"
						onClick={resetFilters}
						className={styles.sheetApply}
						style={{ flex: "0 0 auto", padding: "0 1.5rem" }}
					>
						Сбросить фильтры
					</button>
				)}
			</div>
		);
	}

	return (
		<div>
			<ProductGrid products={products} />

			{hasNextPage && (
				<div ref={sentinelRef} className="flex justify-center py-[2rem]">
					{isFetchingNextPage && (
						<Spinner size="md" label="Загружаем ещё товары" />
					)}
				</div>
			)}

			{/* Конец выдачи отмечен линией со подписью по центру — тем же способом,
			    которым разлинована вся страница. «Показаны все 1 товар» ломалось на
			    единственном числе, а категория с одной позицией не редкость. */}
			{!hasNextPage && (
				<div className="mt-[3rem] flex items-center gap-[1rem]">
					<span className="h-px flex-1 bg-[var(--rule)]" />
					<p className={styles.micro}>
						{products.length === 1
							? "Показан 1 товар"
							: `Показаны все ${products.length} ${pluralizeProducts(products.length)}`}
					</p>
					<span className="h-px flex-1 bg-[var(--rule)]" />
				</div>
			)}
		</div>
	);
}

export default CatalogProductGrid;
