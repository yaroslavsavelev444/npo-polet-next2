import { Empty } from "@/UI";
import type { ProductDetailData } from "../../types";
import { SpecificationsTabContent, SpecRow } from "./SpecificationsTabContent";

interface Props {
	product: ProductDetailData;
}

/**
 * Блок характеристик товара: сами характеристики и габариты/вес в одном месте.
 * Инструкция вынесена в компактный блок у зоны покупки (см. ProductHeader),
 * поэтому здесь не дублируется.
 */
export function CharacteristicsTabContent({ product }: Props) {
	const { specifications, dimensions } = product;

	const dimensionRows = [
		{ name: "Длина", value: dimensions.length, unit: "см" },
		{ name: "Ширина", value: dimensions.width, unit: "см" },
		{ name: "Высота", value: dimensions.height, unit: "см" },
		{ name: "Вес", value: dimensions.weight, unit: "кг" },
	].filter((row) => row.value != null);

	const hasSpecs = specifications.length > 0;
	const hasDimensions = dimensionRows.length > 0;

	if (!hasSpecs && !hasDimensions) {
		return <Empty message="Характеристики не указаны" />;
	}

	return (
		<div className="flex flex-col gap-8">
			{hasSpecs && <SpecificationsTabContent specifications={specifications} />}

			{hasDimensions && (
				<div>
					<h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
						Габариты и вес
					</h3>
					<dl className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
						{dimensionRows.map((row, index) => (
							<SpecRow
								key={row.name}
								name={row.name}
								value={String(row.value)}
								unit={row.unit}
								striped={index % 2 === 0}
							/>
						))}
					</dl>
				</div>
			)}
		</div>
	);
}
