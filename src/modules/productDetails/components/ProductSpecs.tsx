import type { ProductDetailData, ProductSpecificationItem } from "../types";

const DEFAULT_GROUP = "Общие характеристики";

interface SpecGroup {
	name: string;
	items: Array<{
		id: string;
		name: string;
		value: string;
		unit: string | null;
	}>;
}

/**
 * Сводит характеристики и габариты в один список групп. Габариты приходят
 * отдельным полем схемы, но для читателя это такая же группа характеристик,
 * как «Электропитание», и отдельной вёрстки не заслуживает.
 */
export function buildSpecGroups(product: ProductDetailData): SpecGroup[] {
	const groups = new Map<string, SpecGroup["items"]>();

	for (const spec of product.specifications) {
		const groupName = spec.group?.trim() || DEFAULT_GROUP;
		const items = groups.get(groupName) ?? [];
		items.push({
			id: spec.id,
			name: spec.name,
			value: spec.value,
			unit: spec.unit,
		});
		groups.set(groupName, items);
	}

	const { dimensions } = product;
	const dimensionItems = (
		[
			["Длина", dimensions.length, "см"],
			["Ширина", dimensions.width, "см"],
			["Высота", dimensions.height, "см"],
			["Вес", dimensions.weight, "кг"],
		] as const
	)
		.filter(([, value]) => value != null)
		.map(([name, value, unit]) => ({
			id: `dimension-${name}`,
			name,
			value: String(value),
			unit,
		}));

	const result: SpecGroup[] = Array.from(groups, ([name, items]) => ({
		name,
		items,
	}));

	if (dimensionItems.length > 0) {
		result.push({ name: "Габариты и вес", items: dimensionItems });
	}

	return result;
}

/**
 * Таблица характеристик.
 *
 * Прошлая версия раскладывала пары в две колонки во всю ширину страницы:
 * название прижималось к левому краю, значение — к правому, и между ними
 * оставалось до полуметра пустоты, через которую глаз не дотягивался. Полосы
 * зебры при этом красились по индексу в общем списке, а не по позиции в ряду,
 * поэтому в левой колонке они были, а в правой — нет.
 *
 * Здесь пара сама себе сетка с фиксированной колонкой названия: значение
 * начинается на одной и той же вертикали во всех строках, а расстояние между
 * названием и значением не зависит от ширины экрана. Ряды разделены волосяной
 * линией — она не зависит ни от чётности, ни от числа колонок и не ломается,
 * когда строк нечётное количество.
 */
export function ProductSpecs({ groups }: { groups: SpecGroup[] }) {
	if (groups.length === 0) return null;

	return (
		<div className="flex flex-col gap-10">
			{groups.map((group) => (
				<section key={group.name}>
					<h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
						{group.name}
					</h3>

					<dl className="mt-3 grid grid-cols-1 gap-x-12 lg:grid-cols-2">
						{group.items.map((item) => (
							<SpecRow key={item.id} {...item} />
						))}
					</dl>
				</section>
			))}
		</div>
	);
}

function SpecRow({
	name,
	value,
	unit,
}: {
	name: string;
	value: string;
	unit: string | null;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-baseline gap-x-5 border-b border-[var(--hairline)] py-2.5 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:gap-x-6">
			<dt className="text-[13px] leading-snug text-[var(--text-muted)]">
				{name}
			</dt>
			<dd className="text-sm leading-snug font-medium text-[var(--text-primary)]">
				<span className="tabular-nums">{value}</span>
				{unit && (
					<span className="ml-1.5 font-normal text-[var(--text-muted)]">
						{unit}
					</span>
				)}
			</dd>
		</div>
	);
}

export type { ProductSpecificationItem };
