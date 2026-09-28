"use client";

import { useProductFilters } from "../hooks/useProductFilters";
import type { CatalogFacets } from "../types/filters";
import styles from "./Catalog.module.css";

/**
 * «Только со скидкой» — одиночный флажок, а не фасет-список: у признака одно
 * осмысленное значение. Число — сколько товаров со скидкой при остальных
 * фильтрах.
 */
export function DiscountFilter({
	discount,
}: {
	discount: NonNullable<CatalogFacets["discount"]>;
}) {
	const { facets, setDiscount } = useProductFilters();
	const disabled = discount.count === 0 && !facets.discount;

	return (
		<fieldset className={styles.group}>
			<legend className={styles.micro}>Скидка</legend>
			<label className={styles.option} data-disabled={disabled || undefined}>
				<input
					type="checkbox"
					checked={facets.discount}
					disabled={disabled}
					onChange={(event) => setDiscount(event.target.checked)}
					className={styles.controlInput}
				/>
				<span aria-hidden className={styles.optionBox} />
				<span className={styles.optionLabel}>Только со скидкой</span>
				<span className={styles.optionCount}>{discount.count}</span>
			</label>
		</fieldset>
	);
}

export default DiscountFilter;
