import type { ProductDetailData, ProductSpecificationItem } from "../types";
import styles from "./ProductPage.module.css";

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

/** "1 параметр" / "3 параметра" / "5 параметров" — склонение по числу. */
export function pluralizeSpecs(count: number): string {
	const mod10 = count % 10;
	const mod100 = count % 100;
	if (mod10 === 1 && mod100 !== 11) return "параметр";
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
		return "параметра";
	return "параметров";
}

/**
 * Таблица характеристик.
 *
 * Пара «название — значение» сама себе сетка с фиксированной колонкой
 * названия: значение начинается на одной и той же вертикали во всех строках, а
 * расстояние между названием и значением не зависит от ширины экрана. Прежняя
 * раскладка разгоняла пару по краям колонки, и между ними оставалось до
 * полуметра пустоты, через которую глаз не дотягивался.
 *
 * Ряды разделены волосяной линией — она не зависит ни от чётности, ни от числа
 * колонок и не ломается, когда строк нечётное количество. Полосы зебры, стоявшие
 * здесь до линии, красились по индексу в общем списке, а не по позиции в ряду,
 * поэтому в левой колонке они были, а в правой — нет.
 *
 * Наведение подсвечивает строку целиком, включая поле слева и справа от неё
 * (тень того же цвета вместо отрицательных полей — иначе строка вылезала бы за
 * сетку). В таблице на двадцать строк это единственный способ не потерять
 * строку глазами по дороге от названия к значению. Анимации появления у самих
 * строк нет намеренно: двадцать элементов, выезжающих по очереди, — это уже не
 * появление раздела, а рябь.
 */
export function ProductSpecs({ groups }: { groups: SpecGroup[] }) {
	if (groups.length === 0) return null;

	return (
		<div className="flex flex-col gap-[clamp(2rem,3vw,2.75rem)]">
			{groups.map((group) => (
				<section key={group.name}>
					<h3 className={styles.specGroupName}>{group.name}</h3>

					<dl className={styles.specList}>
						{group.items.map((item) => (
							<div key={item.id} className={styles.specRow}>
								<dt className={styles.specName}>{item.name}</dt>
								<dd className={styles.specValue}>
									<span className={styles.specNumber}>{item.value}</span>
									{item.unit && (
										<span className={styles.specUnit}>{item.unit}</span>
									)}
								</dd>
							</div>
						))}
					</dl>
				</section>
			))}
		</div>
	);
}

export type { ProductSpecificationItem };
