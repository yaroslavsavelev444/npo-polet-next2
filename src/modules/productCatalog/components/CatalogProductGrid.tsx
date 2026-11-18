"use client";

import { PackageSearch } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ProductGrid } from "@/modules/productCard/components/productGrid";
import { Spinner } from "@/UI";
import { useProductFilters } from "../hooks/useProductFilters";
import { useProductsInfiniteQuery } from "../hooks/useProductsInfiniteQuery";
import {
	type CatalogVisit,
	catalogProductLinkId,
	getCatalogReturnTarget,
	rememberCatalogVisit,
} from "../lib/catalog-return";
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
		isFetching,
		isFetchingNextPage,
		isFetchNextPageError,
		refetch,
	} = useProductsInfiniteQuery({ categoryId, filters, initialPage });

	const { activeFiltersCount, resetFilters } = useProductFilters();
	const sentinelRef = useRef<HTMLDivElement>(null);
	const pathname = usePathname();
	const query = useSearchParams().toString();
	const [returnTarget, setReturnTarget] = useState<CatalogVisit | null>(null);
	const [keepRetryFocused, setKeepRetryFocused] = useState(false);
	const [announcement, setAnnouncement] = useState("");

	useLayoutEffect(() => {
		const { pathname: currentPath, search } = window.location;
		const isCurrentRoute =
			pathname === currentPath &&
			query === new URLSearchParams(search).toString();
		setReturnTarget(isCurrentRoute ? getCatalogReturnTarget() : null);
		setAnnouncement("");
		setKeepRetryFocused(false);
	}, [pathname, query]);

	useEffect(() => {
		if (!returnTarget) return;
		const link = document.getElementById(
			catalogProductLinkId(returnTarget.productId),
		);
		if (link) {
			// Дожидаемся скролла навигации и появления сетки после загрузки порции.
			const frame = requestAnimationFrame(() => {
				if (getCatalogReturnTarget()?.productId !== returnTarget.productId)
					return;
				const rect = link.getBoundingClientRect();
				const toolbar = document.querySelector<HTMLElement>(
					"[data-catalog-toolbar]",
				);
				const topInset = toolbar
					? Number.parseFloat(getComputedStyle(toolbar).top) +
						toolbar.offsetHeight
					: 0;
				const minTop = topInset + 12;
				const maxTop = window.innerHeight - rect.height - 12;
				const desiredTop =
					returnTarget.linkTop >= minTop && returnTarget.linkTop <= maxTop
						? returnTarget.linkTop
						: Math.max(minTop, (minTop + maxTop) / 2);
				window.scrollTo({
					top: window.scrollY + rect.top - desiredTop,
					behavior: "instant",
				});
				link.focus({ preventScroll: true });
				setReturnTarget(null);
			});
			return () => cancelAnimationFrame(frame);
		}

		// При отсутствии порций в кэше повторяем существующую цепочку курсоров.
		if (isFetching || isFetchNextPageError || status === "error") return;
		if (hasNextPage && (data?.pages.length ?? 0) < returnTarget.pageCount) {
			void fetchNextPage({ cancelRefetch: false });
		} else {
			setReturnTarget(null);
		}
	}, [
		returnTarget,
		status,
		data,
		isFetching,
		isFetchNextPageError,
		hasNextPage,
		fetchNextPage,
	]);

	function handleProductNavigate(productId: string) {
		const pageIndex =
			data?.pages.findIndex(({ products }) =>
				products.some(({ id }) => id === productId),
			) ?? -1;
		rememberCatalogVisit(productId, Math.max(1, pageIndex + 1));
	}

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !hasNextPage || returnTarget || isFetchNextPageError)
			return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !isFetching) {
					void fetchNextPage({ cancelRefetch: false });
				}
			},
			{ rootMargin: "600px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [
		hasNextPage,
		isFetching,
		isFetchNextPageError,
		fetchNextPage,
		returnTarget,
	]);

	const products =
		data?.pages.flatMap((page) => page.products) ?? initialPage.products;

	async function retryNextPage(button: HTMLButtonElement) {
		if (!isFetchNextPageError || isFetching) return;
		setKeepRetryFocused(document.activeElement === button);
		setReturnTarget(null);
		setAnnouncement("Повторяем загрузку товаров");
		const result = await fetchNextPage({ cancelRefetch: false });
		if (!result.isFetchNextPageError) {
			const count = result.data?.pages.at(-1)?.products.length ?? 0;
			setAnnouncement(
				count > 0 ? `Добавлено товаров: ${count}` : "Новых товаров нет",
			);
		}
	}

	if (status === "error" && products.length === 0) {
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
			<ProductGrid
				products={products}
				onProductNavigate={handleProductNavigate}
				getProductLinkId={catalogProductLinkId}
			/>

			{(hasNextPage || keepRetryFocused) && (
				<div ref={sentinelRef} className="flex justify-center py-[2rem]">
					{isFetchingNextPage && !isFetchNextPageError && !keepRetryFocused && (
						<Spinner size="md" label="Загружаем ещё товары" />
					)}
					{(isFetchNextPageError || keepRetryFocused) && (
						<div className="flex flex-col items-center gap-2">
							{isFetchNextPageError && !isFetchingNextPage && (
								<p className="text-sm text-[var(--text-secondary)]">
									Не удалось загрузить ещё товары
								</p>
							)}
							<button
								type="button"
								aria-disabled={isFetching || !isFetchNextPageError}
								onBlur={() => setKeepRetryFocused(false)}
								onClick={(event) => void retryNextPage(event.currentTarget)}
								className="text-sm font-medium text-[var(--accent)] aria-disabled:opacity-60 hover:underline focus-visible:underline"
							>
								{isFetchingNextPage ? "Загружаем…" : "Повторить"}
							</button>
						</div>
					)}
				</div>
			)}
			<p role="status" className="sr-only">
				{isFetchNextPageError && !isFetchingNextPage
					? "Не удалось загрузить ещё товары"
					: announcement}
			</p>

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
