import { Empty } from "@/UI";
import type { ProductDetailData } from "../../types";
import { InstructionCard } from "./InstructionCard";
import { SpecificationsTabContent, SpecRow } from "./SpecificationsTabContent";

interface Props {
	product: ProductDetailData;
}

/**
 * Полный блок характеристик товара. Собирает воедино то, что раньше было
 * размазано по трём вкладкам (характеристики + «все параметры»): сами
 * характеристики, габариты/вес и инструкцию. Одно место — без дублей.
 */
export function CharacteristicsTabContent({ product }: Props) {
	const { specifications, dimensions, instruction } = product;

	const dimensionRows = [
		{ name: "Длина", value: dimensions.length, unit: "см" },
		{ name: "Ширина", value: dimensions.width, unit: "см" },
		{ name: "Высота", value: dimensions.height, unit: "см" },
		{ name: "Вес", value: dimensions.weight, unit: "кг" },
	].filter((row) => row.value != null);

	const hasSpecs = specifications.length > 0;
	const hasDimensions = dimensionRows.length > 0;

	if (!hasSpecs && !hasDimensions && !instruction) {
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

			{instruction && <InstructionCard instruction={instruction} />}
		</div>
	);
}
