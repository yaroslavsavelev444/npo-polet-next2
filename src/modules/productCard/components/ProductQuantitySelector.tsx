"use client";

/**
 * modules/productCard/components/ProductQuantitySelector.tsx
 *
 * CTA-цепочка товара. Два варианта раскладки:
 *
 *  - "card" — одна кнопка во всю ширину. В сетке каталога колонка бывает
 *    170–230 px, и степпер (фиксированные ~100 px) вместе с кнопкой в неё не
 *    помещался: кнопка сжималась в оранжевую полоску шириной с иконку, а на
 *    самых узких колонках выезжала за карточку. Количество здесь не
 *    настраивается — в корзину уходит минимальная партия, а точное число
 *    задаётся на странице товара и в самой корзине.
 *
 *  - "full" — степпер + кнопка. Используется там, где ширины заведомо хватает:
 *    блок покупки на странице товара и липкая панель на мобильном.
 *
 * Оба варианта проходят через одни и те же хуки корзины, поэтому поведение
 * (тосты, редирект на логин, синхронизация счётчика) везде одинаковое.
 *
 * Степпер собран вручную (кнопки + нативный <input type="number">), а не через
 * готовый NumberInput — тот заточен под формы, а не под плотный e-commerce
 * виджет.
 */

import { Check, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { useCartItemsStore } from "@/shared/store/cartItems.store";
import { Button } from "@/UI";
import { cn } from "@/utils/cn";
import { useAddToCart } from "../hooks/useAddToCart";
import { useProductQuantity } from "../hooks/useProductQuantity";
import { useRemoveFromCart } from "../hooks/useRemoveFromCart";
import { PRODUCT_STATUS_LABELS } from "../lib/status";
import type { ProductCardData, ProductQuantitySelectorProps } from "../types";

interface Props extends ProductQuantitySelectorProps {
	product: ProductCardData;
}

const CTA_HEIGHT = "h-10";

export function ProductQuantitySelector({
	product,
	minOrderQuantity,
	maxOrderQuantity,
	variant = "full",
}: Props) {
	const { quantity, isOutOfRange, setQuantity, increase, decrease } =
		useProductQuantity(minOrderQuantity, maxOrderQuantity);
	const { isAdding, addToCart } = useAddToCart();
	const { isRemoving, removeFromCart } = useRemoveFromCart();
	const isInCart = useCartItemsStore((s) => s.productIds.has(product.id));

	const isCompact = variant === "card";
	const isUnavailable =
		product.status === "out_of_stock" || product.status === "discontinued";

	if (isUnavailable) {
		return (
			<button
				type="button"
				disabled
				className={cn(
					CTA_HEIGHT,
					"w-full cursor-not-allowed truncate rounded-[var(--radius-sm)] border border-[var(--hairline)]",
					"px-3 text-[13px] font-medium text-[var(--text-muted)]",
				)}
			>
				{/* В карточке точный статус уже напечатан в служебной строке, и
				    повторять его на кнопке — значит сказать одно и то же дважды в
				    одном блоке. Кнопке остаётся назвать только исход. На странице
				    товара служебной строки нет, поэтому там статус называется
				    полностью. */}
				{isCompact ? "Недоступно" : PRODUCT_STATUS_LABELS[product.status]}
			</button>
		);
	}

	if (isInCart) {
		return (
			<button
				type="button"
				disabled={isRemoving}
				onClick={() => void removeFromCart(product.id, product.title)}
				aria-label={`Убрать «${product.title}» из корзины`}
				className={cn(
					CTA_HEIGHT,
					"group/cta flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] text-[13px] font-medium",
					"bg-[var(--success)]/12 text-[var(--success)] transition-colors duration-150",
					"hover:bg-[var(--error)]/15 hover:text-[var(--error)]",
					"focus-visible:bg-[var(--error)]/15 focus-visible:text-[var(--error)]",
					"disabled:pointer-events-none disabled:opacity-60",
				)}
			>
				<Check
					size={15}
					aria-hidden="true"
					className="shrink-0 group-hover/cta:!hidden group-focus-visible/cta:!hidden"
				/>
				<X
					size={15}
					aria-hidden="true"
					className="hidden shrink-0 group-hover/cta:!block group-focus-visible/cta:!block"
				/>
				<span className="group-hover/cta:!hidden group-focus-visible/cta:!hidden">
					В корзине
				</span>
				<span className="hidden group-hover/cta:!inline group-focus-visible/cta:!inline">
					Убрать
				</span>
			</button>
		);
	}

	const handleAddToCart = () => {
		if (isOutOfRange) return;
		void addToCart(
			product,
			isCompact ? Math.max(minOrderQuantity, 1) : quantity,
		);
	};

	if (isCompact) {
		const batchSize = Math.max(minOrderQuantity, 1);

		return (
			<Button
				variant="primary"
				size="md"
				fullWidth
				loading={isAdding}
				onClick={handleAddToCart}
				aria-label={
					batchSize > 1
						? `Добавить «${product.title}» в корзину — минимальная партия ${batchSize} шт.`
						: `Добавить «${product.title}» в корзину`
				}
				className={cn(CTA_HEIGHT, "gap-2 px-3 text-[13px]")}
			>
				<ShoppingCart className="h-4 w-4 shrink-0" aria-hidden="true" />
				<span className="truncate">В корзину</span>
			</Button>
		);
	}

	return (
		<div className="flex w-full items-stretch gap-2">
			<div
				className={cn(
					CTA_HEIGHT,
					"flex shrink-0 items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--hairline)]",
				)}
			>
				<button
					type="button"
					disabled={quantity <= minOrderQuantity}
					onClick={decrease}
					aria-label="Уменьшить количество"
					className="flex h-full w-9 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
				>
					<Minus size={14} aria-hidden="true" />
				</button>

				<input
					type="number"
					inputMode="numeric"
					value={quantity}
					min={minOrderQuantity}
					max={Number.isFinite(maxOrderQuantity) ? maxOrderQuantity : undefined}
					onChange={(e) =>
						setQuantity(Number(e.target.value) || minOrderQuantity)
					}
					aria-label="Количество товара"
					aria-invalid={isOutOfRange || undefined}
					className={cn(
						"h-full w-10 border-0 bg-transparent text-center text-sm font-medium tabular-nums outline-none",
						"[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
						isOutOfRange ? "text-[var(--error)]" : "text-[var(--text-primary)]",
					)}
				/>

				<button
					type="button"
					disabled={quantity >= maxOrderQuantity}
					onClick={increase}
					aria-label="Увеличить количество"
					className="flex h-full w-9 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent"
				>
					<Plus size={14} aria-hidden="true" />
				</button>
			</div>

			<Button
				variant="primary"
				size="md"
				loading={isAdding}
				disabled={isOutOfRange}
				onClick={handleAddToCart}
				className={cn(CTA_HEIGHT, "min-w-0 flex-1 gap-2 px-[1rem] text-sm")}
			>
				<ShoppingCart className="h-4 w-4 shrink-0" aria-hidden="true" />
				<span className="truncate">В корзину</span>
			</Button>
		</div>
	);
}
