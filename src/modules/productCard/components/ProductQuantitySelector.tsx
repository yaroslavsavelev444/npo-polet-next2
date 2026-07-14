"use client";

/**
 * modules/productCard/components/ProductQuantitySelector.tsx
 *
 * CTA цепочка карточки товара с тремя состояниями:
 *  - товар недоступен (out_of_stock/discontinued) — заблокированная кнопка;
 *  - товар уже в корзине — переключатель, при наведении меняющий вид на
 *    "убрать" (иконка + подсказка меняются местами, не требуя доп. текста);
 *  - товар не в корзине — степпер количества + кнопка добавления.
 *
 * Степпер собран вручную (кнопки + нативный <input type="number">), а не
 * через готовый NumberInput — тот заточен под формы, а не под плотный
 * e-commerce виджет в карточке.
 */

import { Check, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { Button } from "@/UI";
import { cn } from "@/utils/cn";
import { useCartItemsStore } from "@/shared/store/cartItems.store";
import { useAddToCart } from "../hooks/useAddToCart";
import { useRemoveFromCart } from "../hooks/useRemoveFromCart";
import { useProductQuantity } from "../hooks/useProductQuantity";
import { PRODUCT_STATUS_LABELS } from "../lib/status";
import type { ProductCardData, ProductQuantitySelectorProps } from "../types";

interface Props extends ProductQuantitySelectorProps {
  product: ProductCardData;
}

export function ProductQuantitySelector({
  product,
  minOrderQuantity,
  maxOrderQuantity,
}: Props) {
  const { quantity, isOutOfRange, setQuantity, increase, decrease } =
    useProductQuantity(minOrderQuantity, maxOrderQuantity);
  const { isAdding, addToCart } = useAddToCart();
  const { isRemoving, removeFromCart } = useRemoveFromCart();
  const isInCart = useCartItemsStore((s) => s.productIds.has(product.id));

  const isUnavailable =
    product.status === "out_of_stock" || product.status === "discontinued";

  if (isUnavailable) {
    return (
      <Button variant="secondary" size="md" fullWidth disabled className="cursor-not-allowed">
        {PRODUCT_STATUS_LABELS[product.status]}
      </Button>
    );
  }

  if (isInCart) {
    return (
      <button
        type="button"
        disabled={isRemoving}
        onClick={() => void removeFromCart(product.id, product.title)}
        aria-label="Убрать из корзины"
        className={cn(
          "group/cta flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium",
          "bg-[var(--success)]/15 text-[var(--success)] transition-colors duration-150",
          "hover:bg-[var(--error)]/15 hover:text-[var(--error)]",
          "disabled:pointer-events-none disabled:opacity-60",
        )}
      >
        <Check size={16} className="shrink-0 group-hover/cta:!hidden" aria-hidden="true" />
        <X size={16} className="hidden shrink-0 group-hover/cta:!block" aria-hidden="true" />
        <span className="group-hover/cta:!hidden">В корзине</span>
        <span className="hidden group-hover/cta:!inline">Убрать</span>
      </button>
    );
  }

  const handleAddToCart = () => {
    if (isOutOfRange) return;
    void addToCart(product, quantity);
  };

  return (
    <div className="flex w-full items-stretch gap-1.5">
      <div className="flex h-10 shrink-0 items-center overflow-hidden rounded-md border border-[var(--border)]">
        <button
          type="button"
          disabled={quantity <= minOrderQuantity}
          onClick={decrease}
          aria-label="Уменьшить количество"
          className="flex h-full w-8 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-40"
        >
          <Minus size={13} aria-hidden="true" />
        </button>

        <input
          type="number"
          inputMode="numeric"
          value={quantity}
          min={minOrderQuantity}
          max={Number.isFinite(maxOrderQuantity) ? maxOrderQuantity : undefined}
          onChange={(e) => setQuantity(Number(e.target.value) || minOrderQuantity)}
          aria-label="Количество товара"
          className="h-full w-9 border-0 bg-transparent text-center text-sm font-medium tabular-nums text-[var(--text-primary)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <button
          type="button"
          disabled={quantity >= maxOrderQuantity}
          onClick={increase}
          aria-label="Увеличить количество"
          className="flex h-full w-8 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-40"
        >
          <Plus size={13} aria-hidden="true" />
        </button>
      </div>

      <Button
        variant="primary"
        size="md"
        loading={isAdding}
        disabled={isOutOfRange}
        onClick={handleAddToCart}
        className="h-10 min-w-0 flex-1 whitespace-nowrap px-2"
      >
        <span className="flex items-center justify-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">В корзину</span>
        </span>
      </Button>
    </div>
  );
}
