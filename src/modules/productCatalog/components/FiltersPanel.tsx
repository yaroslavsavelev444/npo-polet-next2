"use client";

import { useProductFilters } from "../hooks/useProductFilters";
import type { CatalogFacets, PriceBounds } from "../types/filters";
import styles from "./Catalog.module.css";
import { DiscountFilter } from "./DiscountFilter";
import { FacetList } from "./FacetList";
import { PriceFilter } from "./PriceFilter";
import { SpecFacets } from "./SpecFacets";
import { StatusFilter } from "./StatusFilter";

interface FiltersPanelProps {
	priceBounds: PriceBounds;
	facets: CatalogFacets;
}

/**
 * Полный набор фильтров каталога — содержимое листа фильтров: нижнего на
 * узком экране, бокового на широком.
 *
 * Сначала — общие для любого раздела фильтры (цена, наличие, скидка,
 * производитель), затем — фасеты по характеристикам, набор которых сервер
 * собирает из товаров именно этого раздела. Фасета, который ничего не
 * отсеивает (один производитель на весь раздел, скидка у всех), сервер не
 * присылает — и здесь его нет.
 *
 * Группы разделены волосяной линией, а не пустотой: на маленькой поверхности
 * расстояние, достаточное для разделения, съедает высоту, которой и так нет.
 *
 * Кнопки сброса здесь нет намеренно — она стоит в подвале листа рядом с
 * «Показать N», где принимают решение, а не посреди списка полей.
 */
export function FiltersPanel({ priceBounds, facets }: FiltersPanelProps) {
	const { toggleBrand } = useProductFilters();

	return (
		<div className={styles.sheetGroups}>
			<PriceFilter priceBounds={priceBounds} />
			<StatusFilter variant="list" />
			{facets.discount && <DiscountFilter discount={facets.discount} />}
			{facets.manufacturers.length > 0 && (
				<FacetList
					legend="Производитель"
					values={facets.manufacturers}
					onToggle={toggleBrand}
				/>
			)}
			{facets.specs.length > 0 && <SpecFacets facets={facets.specs} />}
		</div>
	);
}

export default FiltersPanel;
