import { PackageCheck, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import type { ProductCardData } from "@/modules/productCard";
import { ProductPrice } from "@/modules/productCard/components/ProductPrice";
import { ProductQuantitySelector } from "@/modules/productCard/components/ProductQuantitySelector";
import { ProductStatusBadge } from "@/modules/productCard/components/ProductStatusBadge";
import { WishlistButton } from "@/modules/wishlist/components/WishlistButton";
import type { ProductDetailData } from "../types";
import { ProductRatingLink } from "./ProductRatingLink";

interface ProductHeaderProps {
	product: ProductDetailData;
	cardData: ProductCardData;
	rating: { average: number; count: number };
}

/**
 * Информационно-покупательский блок страницы товара. Собран вокруг решения
 * «купить»: категория → название → рейтинг → цена → статус → действия →
 * гарантии. Описание сюда сознательно не входит — оно вынесено в отдельную
 * секцию ниже, чтобы на мобильных кнопка покупки оставалась выше сгиба.
 * Бизнес-логику корзины/избранного не трогаем — переиспользуем готовые
 * ProductQuantitySelector и WishlistButton.
 */
export function ProductHeader({
	product,
	cardData,
	rating,
}: ProductHeaderProps) {
	const { brand } = product;

	return (
		<div className="flex flex-col gap-4">
			{product.category && (
				<Link
					href={`/category/${product.category.slug}`}
					className="w-fit text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] transition-colors hover:text-[var(--primary)]"
				>
					{product.category.title}
				</Link>
			)}

			<h1 className="text-2xl font-semibold leading-snug text-[var(--text-primary)] sm:text-3xl">
				{product.title}
			</h1>

			<ProductRatingLink average={rating.average} count={rating.count} />

			<div className="flex flex-wrap items-center gap-3">
				<ProductPrice
					finalPrice={product.finalPrice}
					originalPrice={product.priceForIndividual}
					hasDiscount={product.hasDiscount}
				/>
				{product.hasDiscount && product.discountPercentage != null && (
					<span className="rounded-full bg-[var(--primary)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--primary)]">
						−{product.discountPercentage}%
					</span>
				)}
			</div>

			<ProductStatusBadge status={product.status} />

			{/* Действия: степпер + корзина + избранное */}
			<div className="mt-1 flex items-stretch gap-2">
				<div className="min-w-0 flex-1">
					<ProductQuantitySelector
						product={cardData}
						minOrderQuantity={product.minOrderQuantity}
						maxOrderQuantity={product.maxOrderQuantity}
					/>
				</div>
				<div className="flex shrink-0 items-center">
					<WishlistButton
						product={cardData}
						className="h-10 w-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-transparent shadow-none hover:bg-[var(--surface-secondary)]"
					/>
				</div>
			</div>

			{/* Гарантии и доставка */}
			<ul className="mt-2 flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
				<TrustRow
					icon={<Truck className="h-4 w-4" />}
					text="Доставка по России и самовывоз"
				/>
				{brand.warrantyMonths ? (
					<TrustRow
						icon={<ShieldCheck className="h-4 w-4" />}
						text={`Гарантия ${brand.warrantyMonths} мес.`}
					/>
				) : null}
				{brand.manufacturer ? (
					<TrustRow
						icon={<PackageCheck className="h-4 w-4" />}
						text={`Производитель: ${brand.manufacturer}`}
					/>
				) : null}
			</ul>
		</div>
	);
}

function TrustRow({ icon, text }: { icon: React.ReactNode; text: string }) {
	return (
		<li className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
			<span className="shrink-0 text-[var(--primary)]">{icon}</span>
			{text}
		</li>
	);
}
