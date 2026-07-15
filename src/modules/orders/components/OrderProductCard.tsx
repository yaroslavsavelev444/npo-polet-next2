import { ImageOff, PackageX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/modules/productCard";
import { cn } from "@/utils/cn";
import type { OrderSuccessItem } from "../lib/build-order-success-view";

interface OrderProductCardProps {
	item: OrderSuccessItem;
}

function discountPercent(original: number, final: number): number {
	if (original <= 0 || final >= original) return 0;
	return Math.round((1 - final / original) * 100);
}

/**
 * Позиция заказа. Кликабельна целиком (stretched link) при наличии `href`.
 * Недоступный (архивный) товар не ссылается никуда, изображение приглушается,
 * добавляется пометка — страница остаётся целой при удалённом товаре.
 */
export function OrderProductCard({ item }: OrderProductCardProps) {
	const {
		name,
		quantity,
		unitOriginalPrice,
		unitFinalPrice,
		lineTotal,
		hasDiscount,
		imageUrl,
		imageAlt,
		href,
		isArchived,
	} = item;

	const percent = discountPercent(unitOriginalPrice, unitFinalPrice);
	const originalLineTotal = unitOriginalPrice * quantity;
	const isInteractive = Boolean(href) && !isArchived;

	return (
		<article
			className={cn(
				"group relative flex items-center gap-3 rounded-[var(--radius-md)] p-2.5 transition-colors sm:gap-4 sm:p-3",
				isInteractive && "hover:bg-[var(--surface-secondary)]",
			)}
		>
			{/* Изображение */}
			<div className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-secondary)] sm:w-20">
				{imageUrl ? (
					<Image
						src={imageUrl}
						alt={imageAlt}
						fill
						sizes="80px"
						className={cn(
							"object-contain p-1.5 transition-transform duration-300",
							isArchived ? "opacity-40 grayscale" : "group-hover:scale-[1.06]",
						)}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
						<ImageOff size={22} aria-hidden />
					</div>
				)}
			</div>

			{/* Название и количество */}
			<div className="min-w-0 flex-1">
				{isInteractive && href ? (
					<Link
						href={href}
						className="block before:absolute before:inset-0 before:z-0 before:content-['']"
					>
						<h3 className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-light)] sm:text-base">
							{name}
						</h3>
					</Link>
				) : (
					<h3 className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-secondary)] sm:text-base">
						{name}
					</h3>
				)}

				<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className="text-xs text-[var(--text-secondary)] sm:text-sm">
						{quantity} шт. × {formatPrice(unitFinalPrice)}
					</span>
					{hasDiscount && (
						<>
							<span className="text-xs text-[var(--text-muted)] line-through">
								{formatPrice(unitOriginalPrice)}
							</span>
							{percent > 0 && (
								<span className="rounded-[var(--radius-sm)] bg-[var(--success)]/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--success)]">
									−{percent}%
								</span>
							)}
						</>
					)}
				</div>

				{isArchived && (
					<span className="mt-1.5 inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
						<PackageX size={13} aria-hidden />
						Товар больше недоступен
					</span>
				)}
			</div>

			{/* Итоговая цена позиции */}
			<div className="shrink-0 text-right tabular-nums">
				{hasDiscount && (
					<div className="text-xs text-[var(--text-muted)] line-through">
						{formatPrice(originalLineTotal)}
					</div>
				)}
				<div className="text-sm font-semibold text-[var(--text-primary)] sm:text-base">
					{formatPrice(lineTotal)}
				</div>
			</div>
		</article>
	);
}
