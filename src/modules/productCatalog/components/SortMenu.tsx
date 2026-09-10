"use client";

import { ArrowDownUp } from "lucide-react";
import { useProductFilters } from "../hooks/useProductFilters";
import { findSortOption, SORT_OPTIONS } from "../lib/catalogOptions";
import styles from "./Catalog.module.css";
import { CatalogPopover } from "./CatalogPopover";

/**
 * Сортировка на десктопе.
 *
 * Не <select> и не «выпадашка с галочкой справа»: кнопка называет текущий
 * порядок целиком («Сортировка: Сначала новые»), а в открытом списке
 * выбранная строка помечена короткой чертой акцента СЛЕВА — там, где
 * начинается чтение. Галочка справа находится глазом последней, и при шести
 * вариантах это заметно.
 *
 * Роль menu/menuitemradio, а не listbox: список меняет порядок выдачи сразу
 * по нажатию, это набор команд, а не поле формы.
 */
export function SortMenu() {
	const { sort, updateSort } = useProductFilters();
	const current = findSortOption(sort.field, sort.order);

	return (
		<CatalogPopover
			align="end"
			label={`Сортировка: ${current.label}`}
			panelClassName={styles.menu}
			trigger={
				<>
					<ArrowDownUp size={14} aria-hidden className={styles.controlIcon} />
					<span className={styles.controlLabel}>Сортировка:</span>
					<span className={styles.controlValue}>{current.label}</span>
				</>
			}
		>
			{(close) => (
				<div role="menu" aria-label="Сортировка">
					{SORT_OPTIONS.map((option) => (
						<button
							key={option.value}
							type="button"
							role="menuitemradio"
							aria-checked={option.value === current.value}
							onClick={() => {
								updateSort(option.field, option.order);
								close();
							}}
							className={styles.menuOption}
						>
							<span aria-hidden className={styles.menuMark} />
							{option.label}
						</button>
					))}
				</div>
			)}
		</CatalogPopover>
	);
}

export default SortMenu;
