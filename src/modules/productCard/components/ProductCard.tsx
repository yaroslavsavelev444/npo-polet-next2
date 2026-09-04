/**
 * modules/productCard/components/ProductCard.tsx
 *
 * Композиционный корень карточки.
 *
 * Геометрия карточки задана слотами, а не содержимым: квадратный кадр,
 * служебная строка ровно в 16 px, цена ровно в 28 px, название ровно в две
 * строки и кнопка, прижатая к низу через mt-auto. Ни соотношение сторон
 * снимка, ни длина названия, ни наличие скидки не могут сдвинуть кнопку по
 * вертикали — при любом наборе товаров ряд карточек читается как сетка, а не
 * как коллаж.
 *
 * Карточка не является ссылкой целиком: вложенные интерактивные элементы
 * (избранное, кнопка добавления) внутри <a> невалидны. Кликабельную область
 * растягивает заголовок приёмом stretched link (before:absolute before:inset-0)
 * через ближайшего позиционированного предка — сам article; остальные
 * интерактивные элементы лежат поверх (z-10+) и остаются доступными.
 */
import Link from "next/link";
import { calculatePriceBreakdown } from "../lib/pricing";
import { getProductHref } from "../lib/routing";
import type { ProductCardProps } from "../types";
import { ProductActions } from "./ProductActions";
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
		<article
			// isolate — карточка создаёт собственный контекст наложения, поэтому её
			// внутренние z-index не «протекают» в корневой контекст и не
			// перекрывают фиксированный хедер при скролле.
			className={`group relative isolate flex h-full flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--surface)] transition-colors duration-200 hover:border-[var(--border-light)] ${className ?? ""}`}
		>
			<ProductActions
				product={product}
				showQuickView={showQuickView}
				onQuickView={onQuickView ? () => onQuickView(product) : undefined}
			/>

			<ProductImage
				images={product.images}
				productId={product.id}
				hasDiscount={hasDiscount}
				discountPercentage={discountPercentage}
				status={product.status}
				priority={priorityImage}
			/>

			<div className="flex flex-1 flex-col p-3 sm:p-3.5">
				<ProductMeta
					status={product.status}
					rating={product.rating}
					reviewsCount={product.reviewsCount}
					minOrderQuantity={product.minOrderQuantity}
				/>

				<ProductPrice
					className="mt-[0.5rem]"
					finalPrice={finalPrice}
					originalPrice={product.priceForIndividual}
					hasDiscount={hasDiscount}
				/>

				<Link
					href={href}
					className="mt-0.5 block rounded-sm before:absolute before:inset-0 before:z-0 before:content-['']"
				>
					<ProductTitle title={product.title} />
				</Link>

				<div className="relative z-10 mt-auto pt-3">
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
