import type { CategoryCardData } from "../types/filters";
import { CategoryCard } from "./CategoryCard";
import styles from "./CategoryCatalog.module.css";

interface CategoryGridProps {
	categories: CategoryCardData[];
	/** Каскад появления — только при первой сборке выдачи, см. CategoryCard. */
	stagger?: boolean;
}

/**
 * Сетка разделов.
 *
 * Число колонок задаётся контейнерными запросами (класс .grid в
 * CategoryCatalog.module.css), поэтому класс @container обязан висеть на
 * ОБЁРТКЕ: элемент не может быть собственным query-контейнером, и при
 * совмещении ролей запросы молча перестают срабатывать — сетка остаётся
 * двухколоночной на любой ширине. Тот же порядок, что и в сетке товаров.
 *
 * <ul>, а не <div>: это перечень разделов, и скринридер обязан объявить его
 * длину до того, как пользователь начнёт его обходить.
 */
export function CategoryGrid({
	categories,
	stagger = true,
}: CategoryGridProps) {
	return (
		<div className="@container">
			<ul className={styles.grid}>
				{categories.map((category, index) => (
					<CategoryCard
						key={category.id}
						category={category}
						index={index}
						priority={index < 4}
						stagger={stagger}
					/>
				))}
			</ul>
		</div>
	);
}

export default CategoryGrid;
