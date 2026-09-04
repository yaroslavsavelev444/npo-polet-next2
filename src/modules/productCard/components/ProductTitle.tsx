/**
 * modules/productCard/components/ProductTitle.tsx
 *
 * Название товара в карточке: ровно две строки, всегда.
 *
 * line-clamp-2 отвечает за верхнюю границу, min-height — за нижнюю: короткое
 * название занимает столько же места, сколько длинное, поэтому кнопка покупки
 * в соседних карточках стоит на одной высоте без распорок.
 *
 * Цвет — основной, а не приглушённый: название идентифицирует товар, и в
 * промышленном каталоге, где позиции различаются одним индексом в конце
 * строки, читаемость названия важнее контраста с ценой.
 */

import type { ProductTitleProps } from "../types";

export function ProductTitle({ title }: ProductTitleProps) {
	return (
		<h3
			title={title}
			className="line-clamp-2 min-h-[2.7em] break-words text-[13px] font-medium leading-[1.35] text-[var(--text-primary)]"
		>
			{title}
		</h3>
	);
}
