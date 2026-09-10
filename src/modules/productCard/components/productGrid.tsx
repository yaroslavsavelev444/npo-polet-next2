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
 * Контейнерные точки останова описывают то, что действительно важно, — ширину
 * колонки: карточка держится в диапазоне ~170–290 px и в каталоге, и в
 * полноширинном блоке «Похожие товары», без отдельных правил для каждого
 * места применения. Прежняя привязка к вьюпорту этого не знала: на 1024 px
 * правило lg:grid-cols-4 делило остаток от боковой панели на четыре части и
 * давало карточки по 150 px, куда не помещались ни цена, ни кнопка.
 *
 * ОТСТУПЫ РАЗНЫЕ ПО ОСЯМ, и это главное, что удерживает сетку без рамок.
 * Расстояние между рядами примерно втрое больше, чем между колонками: у
 * карточки больше нет контейнера, и границу позиции задаёт только пустота.
 * По горизонтали её нужно ровно столько, чтобы соседние кадры не слиплись; по
 * вертикали — столько, чтобы кнопка одной позиции не читалась подписью к
 * снимку следующей. При равных отступах ряды сливаются в непрерывную полосу
 * текста и картинок.
 *
 * Класс @container живёт на ОБЁРТКЕ, а не на самой сетке: элемент не может
 * быть собственным query-контейнером, и при совмещении обеих ролей запросы
 * молча не срабатывают (сетка остаётся двухколоночной на любой ширине).
 */
const GRID_COLUMNS_CLASSNAME = [
	"grid grid-cols-2 gap-x-3 gap-y-[2.25rem]",
	"@[30rem]:gap-x-5 @[30rem]:gap-y-[2.75rem]",
	"@[38rem]:grid-cols-3",
	"@[52rem]:grid-cols-4 @[52rem]:gap-x-6 @[52rem]:gap-y-[3.25rem]",
	"@[72rem]:grid-cols-5",
].join(" ");

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
