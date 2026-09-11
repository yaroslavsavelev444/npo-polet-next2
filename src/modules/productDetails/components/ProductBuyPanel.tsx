import { PackageCheck, ShieldCheck, Truck } from "lucide-react";
import type { ReactNode } from "react";
import type { ProductCardData } from "@/modules/productCard";
import { formatPrice } from "@/modules/productCard";
import { ProductQuantitySelector } from "@/modules/productCard/components/ProductQuantitySelector";
import { WishlistButton } from "@/modules/wishlist/components/WishlistButton";
import type { ProductDetailData } from "../types";
import { ProductInstructionLink } from "./ProductInstructionLink";
import styles from "./ProductPage.module.css";

interface ProductBuyPanelProps {
	product: ProductDetailData;
	cardData: ProductCardData;
}

/**
 * Блок покупки: цена → действие → условия поставки → инструкция.
 *
 * Панель набрана плашкой --void на витрине --background, то есть ТЕМНЕЕ
 * страницы. Это не мелочь оформления: слой светлее страницы читается как
 * наклеенная сверху карточка, слой темнее — как утопленная в страницу панель.
 * Тот же материал держит панель корзины и всплывающие окна каталога, и
 * благодаря ему панели не нужна ни тень, ни толстая рамка — хватает
 * волосяной черты по контуру.
 *
 * Внутри панели вложенных карточек нет. Условия поставки и инструкция —
 * строки одной таблицы, разделённые волосяными линиями: у каждой ровно одно
 * содержание, и собственная рамка ей не нужна.
 */
export function ProductBuyPanel({ product, cardData }: ProductBuyPanelProps) {
	const { brand } = product;
	const hasMinBatch = product.minOrderQuantity > 1;

	const terms: Array<{ icon: ReactNode; text: string }> = [
		{
			icon: <Truck className="h-4 w-4" aria-hidden="true" />,
			text: "Доставка по России и самовывоз",
		},
	];

	if (brand.warrantyMonths) {
		terms.push({
			icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
			text: `Гарантия ${brand.warrantyMonths} мес.`,
		});
	}

	if (brand.manufacturer) {
		terms.push({
			icon: <PackageCheck className="h-4 w-4" aria-hidden="true" />,
			text: `Производитель: ${brand.manufacturer}`,
		});
	}

	return (
		<div className={styles.buyPanel}>
			<div className={styles.buyMain}>
				{/* Цена набрана здесь, а не общим ProductPrice: у карточки каталога
				    цена одной строкой без старой цены (в узкую колонку она не
				    помещалась), а здесь места хватает на всю тройку — итог,
				    зачёркнутый старый и размер скидки. */}
				<p className={styles.priceRow}>
					<span className={styles.priceValue}>
						{formatPrice(product.finalPrice)}
					</span>

					{product.hasDiscount && (
						<>
							<span className={styles.priceOld}>
								{formatPrice(product.priceForIndividual)}
							</span>
							{product.discountPercentage != null && (
								<span className={styles.priceDiscount}>
									−{product.discountPercentage}%
								</span>
							)}
						</>
					)}
				</p>

				<div className={styles.buyActions}>
					<div className="min-w-0 flex-1">
						<ProductQuantitySelector
							product={cardData}
							minOrderQuantity={product.minOrderQuantity}
							maxOrderQuantity={product.maxOrderQuantity}
						/>
					</div>
					<WishlistButton
						product={cardData}
						tone="glass"
						className="h-10 w-10 rounded-[var(--radius-sm)]"
					/>
				</div>

				{hasMinBatch && (
					<p className={styles.buyNote}>
						Минимальный заказ —{" "}
						<span className={styles.buyNoteValue}>
							{product.minOrderQuantity} шт.
						</span>
					</p>
				)}
			</div>

			<ul className={styles.terms}>
				{terms.map((row) => (
					<li key={row.text} className={styles.termRow}>
						<span className={styles.termIcon}>{row.icon}</span>
						{row.text}
					</li>
				))}
			</ul>

			{product.instruction && (
				<ProductInstructionLink instruction={product.instruction} />
			)}
		</div>
	);
}
