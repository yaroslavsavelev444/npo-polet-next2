/**
 * modules/productCard/components/ProductTitle.tsx
 *
 * Название товара в карточке: ровно две строки, всегда. line-clamp отвечает за
 * верхнюю границу, min-height — за нижнюю, поэтому короткое название занимает
 * столько же места, сколько длинное, и цена с кнопкой в соседних позициях
 * стоят на одной высоте без распорок. Геометрия — в .title
 * (ProductCard.module.css).
 *
 * Цвет — основной, а не приглушённый: название идентифицирует товар, и в
 * промышленном каталоге, где позиции различаются одним индексом в конце
 * строки, читаемость названия важнее контраста с ценой. При наведении на
 * карточку название уходит в акцент — без рамки и подложки это единственный
 * способ показать, что нажатие ведёт на товар.
 */

import type { ProductTitleProps } from "../types";
import styles from "./ProductCard.module.css";

export function ProductTitle({ title }: ProductTitleProps) {
	return (
		<h3 title={title} className={styles.title}>
			{title}
		</h3>
	);
}
