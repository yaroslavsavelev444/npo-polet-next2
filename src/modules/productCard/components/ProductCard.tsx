/**
 * modules/productCard/components/ProductCard.tsx
 *
 * Композиционный корень карточки.
 *
 * У карточки нет карточки: ни поверхности, ни рамки, ни скругления вокруг
 * товара — только квадратный кадр и текст под ним, выходящий на тот же левый
 * край. Чем держится структура сетки без контейнеров, разобрано в шапке
 * ProductCard.module.css.
 *
 * Порядок чтения: кадр → служебная строка → название → цена → действие. Он
 * повторяет порядок решения: узнал по снимку, опознал по названию, оценил по
 * цене, нажал. Раньше цена стояла ВЫШЕ названия, и карточка начинала разговор
 * с суммы, ещё не сказав, за что она.
 *
 * Геометрия задана слотами, а не содержимым: служебная строка ровно 16 px,
 * название ровно две строки, цена ровно 28 px, кнопка прижата к низу. Ни
 * пропорции снимка, ни длина названия, ни наличие скидки не могут сдвинуть
 * кнопку по вертикали.
 *
 * Карточка не является ссылкой целиком: вложенные интерактивные элементы
 * (избранное, кнопка покупки) внутри <a> невалидны. Кликабельную область
 * растягивает заголовок приёмом stretched link; остальные действия лежат выше
 * по z-index и остаются доступными.
 */
import Link from "next/link";
import { calculatePriceBreakdown } from "../lib/pricing";
import { getProductHref } from "../lib/routing";
import type { ProductCardProps } from "../types";
import { ProductActions } from "./ProductActions";
import styles from "./ProductCard.module.css";
import { ProductImage } from "./ProductImage";
import { ProductMeta } from "./ProductMeta";
import { ProductPrice } from "./ProductPrice";
import { ProductQuantitySelector } from "./ProductQuantitySelector";
import { ProductTitle } from "./ProductTitle";

export function ProductCard({
	product,
	currentCategorySlug,
	showQuickView = false,
	onQuickView,
	priorityImage = false,
	className,
}: ProductCardProps) {
	const { finalPrice, hasDiscount, discountPercentage } =
		calculatePriceBreakdown(product.priceForIndividual, product.discount);

	const href = getProductHref(product, currentCategorySlug);

	return (
		<article className={`${styles.card} ${className ?? ""}`}>
			<ProductImage
				images={product.images}
				productId={product.id}
				hasDiscount={hasDiscount}
				discountPercentage={discountPercentage}
				status={product.status}
				priority={priorityImage}
			>
				<ProductActions
					product={product}
					showQuickView={showQuickView}
					onQuickView={onQuickView ? () => onQuickView(product) : undefined}
				/>
			</ProductImage>

			<div className={styles.body}>
				<ProductMeta
					status={product.status}
					rating={product.rating}
					reviewsCount={product.reviewsCount}
					minOrderQuantity={product.minOrderQuantity}
				/>

				<Link href={href} className={styles.titleLink}>
					<ProductTitle title={product.title} />
				</Link>

				<ProductPrice
					finalPrice={finalPrice}
					originalPrice={product.priceForIndividual}
					hasDiscount={hasDiscount}
				/>

				<div className={styles.ctaSlot}>
					<ProductQuantitySelector
						variant="card"
						product={product}
						minOrderQuantity={product.minOrderQuantity}
						maxOrderQuantity={product.maxOrderQuantity}
					/>
				</div>
			</div>
		</article>
	);
}
