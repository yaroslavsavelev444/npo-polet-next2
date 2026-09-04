import { PackageCheck, ShieldCheck, Truck } from "lucide-react";
import type { ReactNode } from "react";
import type { ProductCardData } from "@/modules/productCard";
import { ProductPrice } from "@/modules/productCard/components/ProductPrice";
import { ProductQuantitySelector } from "@/modules/productCard/components/ProductQuantitySelector";
import { WishlistButton } from "@/modules/wishlist/components/WishlistButton";
import type { ProductDetailData } from "../types";
import { ProductInstructionLink } from "./ProductInstructionLink";

interface ProductBuyPanelProps {
	product: ProductDetailData;
	cardData: ProductCardData;
}

/**
 * Блок покупки: цена → действие → условия поставки → инструкция.
 *
 * Раньше сюда же входили название товара и рейтинг, а вся колонка была
 * шириной 380 px: длинное техническое название разваливалось на восемь строк
 * крупного полужирного текста и занимало весь первый экран, оттесняя кнопку
 * вниз. Название и рейтинг переехали в шапку страницы во всю ширину, а панели
 * осталось ровно то, ради чего в неё смотрят.
 *
 * Панель — один контейнер с одной рамкой; вложенных карточек внутри нет.
 * Условия поставки и инструкция разделены волосяными линиями: это строки
 * одной таблицы, а не отдельные блоки, каждый со своей рамкой и тенью.
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
		<div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--hairline)] bg-[var(--surface)]">
			<div className="flex flex-col gap-4 p-5">
				<ProductPrice
					size="detail"
					finalPrice={product.finalPrice}
					originalPrice={product.priceForIndividual}
					hasDiscount={product.hasDiscount}
					discountPercentage={product.discountPercentage}
				/>

				<div className="flex items-stretch gap-2">
					<div className="min-w-0 flex-1">
						<ProductQuantitySelector
							product={cardData}
							minOrderQuantity={product.minOrderQuantity}
							maxOrderQuantity={product.maxOrderQuantity}
						/>
					</div>
					<WishlistButton
						product={cardData}
						className="h-10 w-10 shrink-0 rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-transparent shadow-none hover:bg-[var(--surface-hover)]"
					/>
				</div>

				{hasMinBatch && (
					<p className="text-xs text-[var(--text-muted)]">
						Минимальный заказ —{" "}
						<span className="tabular-nums text-[var(--text-secondary)]">
							{product.minOrderQuantity} шт.
						</span>
					</p>
				)}
			</div>

			<ul className="flex flex-col border-t border-[var(--hairline)]">
				{terms.map((row) => (
					<li
						key={row.text}
						className="flex items-center gap-3 px-5 py-3 text-[13px] text-[var(--text-secondary)] not-first:border-t not-first:border-[var(--hairline)]"
					>
						<span className="shrink-0 text-[var(--primary)]">{row.icon}</span>
						{row.text}
					</li>
				))}
			</ul>

			{product.instruction && (
				<div className="border-t border-[var(--hairline)]">
					<ProductInstructionLink instruction={product.instruction} />
				</div>
			)}
		</div>
	);
}
