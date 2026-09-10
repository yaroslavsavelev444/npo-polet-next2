"use client";

import type { PriceBounds } from "../types/filters";
import styles from "./Catalog.module.css";
import { PriceFilter } from "./PriceFilter";
import { StatusFilter } from "./StatusFilter";

interface FiltersPanelProps {
	priceBounds: PriceBounds;
}

/**
 * Полный набор фильтров каталога — содержимое нижнего листа на узком экране.
 *
 * Группы разделены волосяной линией, а не пустотой: на маленькой поверхности
 * расстояние, достаточное для разделения, съедает высоту, которой и так нет.
 *
 * Кнопки сброса здесь нет намеренно — она стоит в подвале листа рядом с
 * «Показать N», где принимают решение, а не посреди списка полей.
 */
export function FiltersPanel({ priceBounds }: FiltersPanelProps) {
	return (
		<div className={styles.sheetGroups}>
			<PriceFilter priceBounds={priceBounds} />
			<StatusFilter variant="list" />
		</div>
	);
}

export default FiltersPanel;
