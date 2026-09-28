"use client";

import { formatPrice } from "@/modules/productCard";
import { useProductFilters } from "../hooks/useProductFilters";
import type { PriceBounds } from "../types/filters";
import { RangeFilter } from "./RangeFilter";

interface PriceFilterProps {
	priceBounds: PriceBounds;
	/** Имя группы. В поповере его уже несёт кнопка, которой поповер открыли, —
	 *  и печатать «Цена» второй раз в трёх сантиметрах от первого незачем.
	 *  Живой диапазон значений показывается всегда: это единственная подпись,
	 *  которая отвечает на вопрос «что я сейчас выбрал». */
	showLabel?: boolean;
}

/**
 * Диапазон цены — RangeFilter над priceFrom/priceTo адреса.
 */
export function PriceFilter({
	priceBounds,
	showLabel = true,
}: PriceFilterProps) {
	const { filters, debouncedUpdateFilters } = useProductFilters();

	return (
		<RangeFilter
			label={showLabel ? "Цена" : undefined}
			min={priceBounds.min}
			max={priceBounds.max}
			from={filters.priceFrom}
			to={filters.priceTo}
			suffix="₽"
			format={formatPrice}
			ariaName="Цена"
			onCommit={(priceFrom, priceTo) =>
				debouncedUpdateFilters({ priceFrom, priceTo })
			}
		/>
	);
}

export default PriceFilter;
