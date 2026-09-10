"use client";

import { useProductFilters } from "../hooks/useProductFilters";
import { findSortOption, SORT_OPTIONS } from "../lib/catalogOptions";
import styles from "./Catalog.module.css";
import { CatalogSheet } from "./CatalogSheet";

interface Props {
	open: boolean;
	onClose: () => void;
}

/**
 * Сортировка на узком экране: тот же список, что в десктопном меню, но
 * набранный под палец — строка высотой 2.75rem во всю ширину листа и та же
 * отметка акцента слева, что и на десктопе. Выбор закрывает лист сразу:
 * подтверждать нечего, порядок уже изменился.
 */
export function MobileSortSheet({ open, onClose }: Props) {
	const { sort, updateSort } = useProductFilters();
	const current = findSortOption(sort.field, sort.order);

	return (
		<CatalogSheet open={open} onClose={onClose} title="Сортировка">
			<div className={styles.optionList} role="group" aria-label="Сортировка">
				{SORT_OPTIONS.map((option) => (
					<button
						key={option.value}
						type="button"
						aria-pressed={option.value === current.value}
						onClick={() => {
							updateSort(option.field, option.order);
							onClose();
						}}
						className={styles.option}
					>
						<span aria-hidden className={styles.optionDot} />
						{option.label}
					</button>
				))}
			</div>
		</CatalogSheet>
	);
}

export default MobileSortSheet;
