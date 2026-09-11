"use client";

import { ArrowRight, SearchX } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { useCategoryFilters } from "../hooks/useCategoryFilters";
import { applyCategoryFilters } from "../lib/applyCategoryFilters";
import { pluralizeCategories } from "../lib/categoryOptions";
import type { CategoryCardData, CategoryFilters } from "../types/filters";
import styles from "./CategoryCatalog.module.css";
import { CategoryGrid } from "./CategoryGrid";
import { CategoryToolbar } from "./CategoryToolbar";

interface CategoryCatalogViewProps {
	/** Полный список разделов в порядке из админки. */
	categories: CategoryCardData[];
	/** Состояние, разобранное сервером из адреса, — начальное для витрины. */
	initialFilters: CategoryFilters;
	totalProducts: number;
}

/**
 * Витрина разделов: панель управления, сетка, хвост.
 *
 * Отбор идёт здесь, в памяти браузера, а не на сервере (разбор — в
 * useCategoryFilters). Список разделов приходит целиком: их десятки, а в
 * облегчённой форме (CategoryCardData) это единицы килобайт — дешевле одного
 * обращения к серверу, которых при серверном отборе было бы по одному на
 * каждую букву запроса.
 *
 * Первая отрисовка при этом остаётся серверной и уже отфильтрованной: сервер
 * применяет ту же функцию к тому же состоянию из адреса, поэтому в HTML
 * попадает готовая выдача — и для поисковика, и для случая, когда JS не
 * выполнился.
 */
export function CategoryCatalogView({
	categories,
	initialFilters,
	totalProducts,
}: CategoryCatalogViewProps) {
	const {
		query,
		filters,
		sort,
		updateQuery,
		clearQuery,
		updateSort,
		resetFilters,
		activeFiltersCount,
	} = useCategoryFilters(initialFilters);

	const visible = useMemo(
		() => applyCategoryFilters(categories, filters),
		[categories, filters],
	);

	// Каскад появления — только у выдачи, собранной до первого действия
	// пользователя. После него карточки обязаны появляться немедленно: 45 мс
	// на позицию, умноженные на сдвиг, при вводе читаются задержкой
	// интерфейса, а не приёмом.
	const [staggerEnabled, setStaggerEnabled] = useState(true);
	const initialRef = useRef(filters);
	useEffect(() => {
		if (filters !== initialRef.current) setStaggerEnabled(false);
	}, [filters]);

	const isFiltered = activeFiltersCount > 0;

	return (
		<div className="flex flex-col">
			{/* Панель — прямой потомок колонки, без обёртки: её собственный
			    отступ задан в .rail, а обёртка ростом с панель отняла бы у
			    position: sticky ход (разбор — в Catalog.module.css). */}
			<CategoryToolbar
				query={query}
				onQueryChange={updateQuery}
				onQueryClear={clearQuery}
				sortField={sort.field}
				sortOrder={sort.order}
				onSortChange={updateSort}
				onReset={resetFilters}
				filteredCount={visible.length}
				totalCount={categories.length}
				totalProducts={totalProducts}
				activeFiltersCount={activeFiltersCount}
			/>

			<div className="mt-[2rem] sm:mt-[2.5rem]">
				{visible.length > 0 ? (
					<>
						<CategoryGrid categories={visible} stagger={staggerEnabled} />

						{/* Конец списка отмечен так же, как конец выдачи товаров:
						    линия со служебной подписью. Пока выдача сужена, подпись
						    говорит про отбор, а не про весь каталог. */}
						<div className={styles.tail}>
							<span aria-hidden className={styles.tailRule} />
							<p className={catalog.micro}>
								{isFiltered
									? `Найдено ${visible.length} ${pluralizeCategories(visible.length)}`
									: `Показаны все ${visible.length} ${pluralizeCategories(visible.length)}`}
							</p>
							<span aria-hidden className={styles.tailRule} />
						</div>
					</>
				) : (
					<div className={styles.empty}>
						<SearchX
							size={28}
							strokeWidth={1.25}
							aria-hidden
							className="text-[var(--border-light)]"
						/>
						<div className="flex flex-col items-center gap-2">
							<p className={styles.emptyTitle}>Ничего не найдено</p>
							<p className={styles.emptyText}>
								{isFiltered
									? "По запросу не нашлось ни одного раздела. Попробуйте другое слово или посмотрите каталог целиком."
									: "Каталог пока пуст. Разделы появятся здесь, как только их опубликуют."}
							</p>
						</div>
						{isFiltered && (
							<button
								type="button"
								onClick={resetFilters}
								className={styles.emptyAction}
							>
								Показать весь каталог
							</button>
						)}
					</div>
				)}
			</div>

			<div className={styles.help}>
				<p className={styles.helpText}>
					Не нашли нужное решение? Часть изделий собирается под задачу и в
					каталог не попадает — опишите условия, подберём конфигурацию.
				</p>
				<Link href="/contacts" className={styles.helpLink}>
					Связаться с нами
					<ArrowRight size={15} aria-hidden className={styles.helpArrow} />
				</Link>
			</div>
		</div>
	);
}

export default CategoryCatalogView;
