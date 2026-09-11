import type { ProductCardData } from "@/modules/productCard";
import { ProductGrid } from "@/modules/productCard/components/productGrid";
import { ProductSection } from "./ProductSection";

interface Props {
	products: ProductCardData[];
	className?: string;
}

/**
 * Похожие товары.
 *
 * Раньше блок собирался через ProductListContainer — обёртку с собственным
 * заголовком, который набирался иначе, чем остальные разделы страницы. Здесь
 * он такой же раздел, как «Описание» и «Характеристики»: та же линия-прочерк,
 * та же акцидентная гарнитура, тот же вертикальный ритм. Сетка карточек при
 * этом остаётся общей — она одна на каталог, избранное и подборку на главной.
 */
export function ProductRelated({ products, className }: Props) {
	if (products.length === 0) return null;

	// Приписки с числом у этого раздела нет: сколько позиций в подборке, видно
	// по самой сетке, а голое число рядом с названием читалось бы кодом. Она
	// нужна там, где содержимое длиннее экрана и счёт заранее неочевиден, — у
	// характеристик и отзывов.
	return (
		<ProductSection title="Похожие товары" className={className}>
			<ProductGrid products={products} />
		</ProductSection>
	);
}
