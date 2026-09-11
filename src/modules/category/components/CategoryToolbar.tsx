"use client";

import { ArrowDownUp, Search, X } from "lucide-react";
import { useId, useState } from "react";
import catalog from "@/modules/productCatalog/components/Catalog.module.css";
import { CatalogPopover } from "@/modules/productCatalog/components/CatalogPopover";
import { CatalogSheet } from "@/modules/productCatalog/components/CatalogSheet";
import { pluralizeProducts } from "@/modules/productCatalog/lib/catalogOptions";
import {
	CATEGORY_SORT_OPTIONS,
	findCategorySortOption,
	pluralizeCategories,
} from "../lib/categoryOptions";
import type { CategorySortField, CategorySortOrder } from "../types/filters";
import styles from "./CategoryCatalog.module.css";

interface CategoryToolbarProps {
	query: string;
	onQueryChange: (value: string) => void;
	onQueryClear: () => void;
	sortField: CategorySortField;
	sortOrder: CategorySortOrder;
	onSortChange: (field: CategorySortField, order: CategorySortOrder) => void;
	onReset: () => void;
	filteredCount: number;
	totalCount: number;
	totalProducts: number;
	activeFiltersCount: number;
}

/**
 * Единственный орган управления витриной разделов.
 *
 * Панель липкая и садится ровно под шапку сайта — та же .rail, что держит
 * выдачу товаров внутри раздела. Это не «похожий» компонент: класс тот же
 * самый, поэтому два яруса каталога не могут разъехаться ни по высоте, ни по
 * материалу, ни по поведению при прокрутке.
 *
 * ─── Что в панели и почему именно это ───────────────────────────────────────
 * У верхнего яруса ровно два измерения: найти раздел по названию и
 * переупорядочить список. Фильтров нет — фильтровать разделы не по чему,
 * поэтому нет и кнопки «Фильтры», которая на этой странице открывала бы
 * пустой лист.
 *
 * Поиск вынесен в панель, а не спрятан за кнопку: когда разделов два
 * десятка, это самый быстрый путь к нужному, и прятать его за лишнее нажатие
 * значит менять секунду на иконку.
 *
 * ─── Узкий экран и широкий — разные интерфейсы ──────────────────────────────
 * На телефоне поиск занимает всю первую строку (по нему бьют пальцем и в него
 * печатают), сводка уходит под него, сортировка живёт в нижнем листе со
 * строками под палец. С 48rem всё складывается в одну строку, а с 64rem
 * сортировка раскрывается меню у своей кнопки — ровно как на странице
 * раздела.
 */
export function CategoryToolbar({
	query,
	onQueryChange,
	onQueryClear,
	sortField,
	sortOrder,
	onSortChange,
	onReset,
	filteredCount,
	totalCount,
	totalProducts,
	activeFiltersCount,
}: CategoryToolbarProps) {
	const [sortSheetOpen, setSortSheetOpen] = useState(false);
	const searchId = useId();
	const current = findCategorySortOption(sortField, sortOrder);
	const isSearching = query.trim().length > 0;

	const sortOptions = CATEGORY_SORT_OPTIONS;

	return (
		<div className={catalog.rail}>
			<div className={styles.controls}>
				{/* Сводка. role="status" — чтобы результат поиска проговаривался
				    скринридеру: визуально он виден по перестроившейся сетке, а на
				    слух без этого ничего не происходит. */}
				<div className={styles.metaCell}>
					<p className={catalog.summary} role="status">
						<span className={catalog.summaryValue}>{filteredCount}</span>
						<span className={catalog.micro}>
							{pluralizeCategories(filteredCount)}
						</span>
					</p>

					{isSearching ? (
						<p className={`${catalog.micro} ${catalog.summaryRange}`}>
							из {totalCount}
						</p>
					) : (
						totalProducts > 0 && (
							<p className={`${catalog.micro} ${catalog.summaryRange}`}>
								{totalProducts} {pluralizeProducts(totalProducts)}
							</p>
						)
					)}

					{activeFiltersCount > 0 && (
						<button
							type="button"
							onClick={onReset}
							className={catalog.resetLink}
						>
							Сбросить
						</button>
					)}
				</div>

				<div className={styles.searchCell}>
					<div className={styles.search}>
						<Search
							size={15}
							aria-hidden
							className={styles.searchIcon}
							strokeWidth={1.75}
						/>
						{/* Подпись есть, но не видна: над полем в липкой панели она
						    съела бы строку, а без неё поле остаётся безымянным для
						    скринридера. */}
						<label htmlFor={searchId} className="sr-only">
							Поиск по каталогу
						</label>
						<input
							id={searchId}
							type="search"
							value={query}
							onChange={(event) => onQueryChange(event.target.value)}
							onKeyDown={(event) => {
								// Escape очищает поле, не выходя из него: привычный жест
								// для строки поиска, и он же спасает от «поиск сузил
								// выдачу до нуля, а поле далеко вверху».
								if (event.key === "Escape" && query) {
									event.preventDefault();
									onQueryClear();
								}
							}}
							placeholder="Поиск по каталогу"
							autoComplete="off"
							spellCheck={false}
							enterKeyHint="search"
							className={styles.searchInput}
						/>
						{query && (
							<button
								type="button"
								onClick={onQueryClear}
								aria-label="Очистить поиск"
								className={styles.searchClear}
							>
								<X size={14} aria-hidden />
							</button>
						)}
					</div>
				</div>

				{/* Обёртки — обычные div без классов модуля: правила display из
				    CSS-модуля перебивают утилиты Tailwind (модуль не завёрнут в
				    слой, см. шапку globals.css), и hidden/lg:hidden на самом
				    элементе молча не сработали бы. */}
				<div className={styles.sortCell}>
					<div className="hidden lg:block">
						<CatalogPopover
							align="end"
							label={`Сортировка: ${current.label}`}
							panelClassName={catalog.menu}
							trigger={
								<>
									<ArrowDownUp
										size={14}
										aria-hidden
										className={catalog.controlIcon}
									/>
									<span className={catalog.controlLabel}>Сортировка:</span>
									<span className={catalog.controlValue}>{current.label}</span>
								</>
							}
						>
							{(close) => (
								<div role="menu" aria-label="Сортировка">
									{sortOptions.map((option) => (
										<button
											key={option.value}
											type="button"
											role="menuitemradio"
											aria-checked={option.value === current.value}
											onClick={() => {
												onSortChange(option.field, option.order);
												close();
											}}
											className={catalog.menuOption}
										>
											<span aria-hidden className={catalog.menuMark} />
											{option.label}
										</button>
									))}
								</div>
							)}
						</CatalogPopover>
					</div>

					<div className="lg:hidden">
						<button
							type="button"
							onClick={() => setSortSheetOpen(true)}
							aria-label={`Сортировка: ${current.label}`}
							className={`${catalog.control} ${catalog.controlCompact}`}
						>
							<ArrowDownUp
								size={14}
								aria-hidden
								className={catalog.controlIcon}
							/>
							<span className={catalog.controlText}>Сортировка</span>
						</button>
					</div>
				</div>
			</div>

			<CatalogSheet
				open={sortSheetOpen}
				onClose={() => setSortSheetOpen(false)}
				title="Сортировка"
			>
				<div
					className={catalog.optionList}
					role="group"
					aria-label="Сортировка"
				>
					{sortOptions.map((option) => (
						<button
							key={option.value}
							type="button"
							aria-pressed={option.value === current.value}
							onClick={() => {
								onSortChange(option.field, option.order);
								setSortSheetOpen(false);
							}}
							className={catalog.option}
						>
							<span aria-hidden className={catalog.optionDot} />
							{option.label}
						</button>
					))}
				</div>
			</CatalogSheet>
		</div>
	);
}

export default CategoryToolbar;
