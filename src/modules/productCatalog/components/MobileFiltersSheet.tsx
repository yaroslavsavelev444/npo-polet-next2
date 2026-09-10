"use client";

import { useProductFilters } from "../hooks/useProductFilters";
import { pluralizeProducts } from "../lib/catalogOptions";
import type { PriceBounds } from "../types/filters";
import styles from "./Catalog.module.css";
import { CatalogSheet } from "./CatalogSheet";
import { FiltersPanel } from "./FiltersPanel";

interface Props {
	open: boolean;
	onClose: () => void;
	priceBounds: PriceBounds;
	resultCount: number;
}

/**
 * Фильтры на узком экране.
 *
 * Подвал листа несёт оба исхода сразу: «Сбросить» слева и «Показать N» во всю
 * оставшуюся ширину справа. Число в подписи — не украшение: оно обновляется по
 * мере кручения фильтров и отвечает на единственный вопрос, который держит
 * палец над кнопкой, — «а что там останется».
 */
export function MobileFiltersSheet({
	open,
	onClose,
	priceBounds,
	resultCount,
}: Props) {
	const { activeFiltersCount, resetFilters } = useProductFilters();

	return (
		<CatalogSheet
			open={open}
			onClose={onClose}
			title="Фильтры"
			titleNote={
				activeFiltersCount > 0 ? (
					<span className={styles.micro}>
						{activeFiltersCount === 1
							? "1 активен"
							: `${activeFiltersCount} активны`}
					</span>
				) : undefined
			}
			footer={
				<>
					<button
						type="button"
						onClick={resetFilters}
						disabled={activeFiltersCount === 0}
						className={styles.sheetReset}
					>
						Сбросить
					</button>
					<button type="button" onClick={onClose} className={styles.sheetApply}>
						Показать {resultCount} {pluralizeProducts(resultCount)}
					</button>
				</>
			}
		>
			<FiltersPanel priceBounds={priceBounds} />
		</CatalogSheet>
	);
}

export default MobileFiltersSheet;
