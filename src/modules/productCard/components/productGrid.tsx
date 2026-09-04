// modules/productCard/components/productGrid.tsx
import { ProductCard } from "@/modules/productCard";
import type { ProductCardData } from "@/modules/productCard/types";
import { ProductCardSkeleton } from "./ProductCardSkeleton";

interface ProductGridProps {
	products: ProductCardData[];
	showQuickView?: boolean;
	onQuickView?: (product: ProductCardData) => void;
	className?: string;
}

/**
 * Число колонок берётся из ширины самой сетки (@container), а не из ширины
 * окна.
 *
 * Раньше колонки были привязаны к вьюпорту, и сетка ничего не знала о боковой
 * панели фильтров: на 1024 px правило lg:grid-cols-4 делило оставшиеся 648 px
 * на четыре части и давало карточки по 150 px, куда не помещались ни кнопка,
 * ни цена. Контейнерные точки останова описывают то, что действительно важно,
 * — ширину колонки: карточка держится в диапазоне ~170–290 px и в каталоге с
 * фильтрами, и в полноширинном блоке «Похожие товары», без отдельных правил
 * для каждого места применения.
 *
 * Класс @container живёт на ОБЁРТКЕ, а не на самой сетке: элемент не может
 * быть собственным query-контейнером, и при совмещении обеих ролей запросы
 * молча не срабатывают (сетка остаётся двухколоночной на любой ширине).
 */
const GRID_COLUMNS_CLASSNAME =
	"grid grid-cols-2 gap-3 @[38rem]:grid-cols-3 @[38rem]:gap-4 @[52rem]:grid-cols-4 @[72rem]:grid-cols-5 @[72rem]:gap-5";

/**
 * Сетка скелетонов для Suspense-фолбэка каталога. Раскладку берёт из той же
 * константы, что и настоящая сетка, поэтому число колонок при подстановке
 * данных не меняется. Раньше вместо неё экспортировался голый класс — его
 * легко было навесить на элемент, который сам же и объявлял @container, и
 * тогда контейнерные запросы молча переставали срабатывать.
 */
export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
	return (
		<div className="@container">
			<div className={GRID_COLUMNS_CLASSNAME}>
				{Array.from({ length: count }, (_, index) => (
					<ProductCardSkeleton key={index} />
				))}
			</div>
		</div>
	);
}

export function ProductGrid({
	products,
	showQuickView,
	onQuickView,
	className,
}: ProductGridProps) {
	return (
		<div className={`@container ${className || ""}`}>
			<div className={GRID_COLUMNS_CLASSNAME}>
				{products.map((product, index) => (
					<ProductCard
						key={product.id}
						product={product}
						showQuickView={showQuickView}
						onQuickView={onQuickView}
						// Первый ряд грузится приоритетно: это самые вероятные LCP-кадры.
						priorityImage={index < 5}
					/>
				))}
			</div>
		</div>
	);
}
