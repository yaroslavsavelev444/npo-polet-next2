"use client";

/**
 * modules/productCard/components/ProductQuantitySelector.tsx
 *
 * Степпер количества + кнопка "В корзину". Компактный inline-stepper
 * собран вручную (IconButton + нативный <input type="number">), а не
 * через once-ui NumberInput — у NumberInput встроенный label/вертикальные
 * шевроны заточены под формы, а не под плотный e-commerce виджет в карточке.
 */

import { Minus, Plus, ShoppingCart } from "lucide-react";
import {  IconButton } from "@once-ui-system/core";
import { useAddToCart } from "../hooks/useAddToCart";
import { useProductQuantity } from "../hooks/useProductQuantity";
import type { ProductCardData, ProductQuantitySelectorProps } from "../types";
import { Button } from "@/UI";
interface Props extends ProductQuantitySelectorProps {
  product: ProductCardData;
}

export function ProductQuantitySelector({
  product,
  minOrderQuantity,
  maxOrderQuantity,
  isOutOfStock,
}: Props) {
  const { quantity, isOutOfRange, setQuantity, increase, decrease } =
    useProductQuantity(minOrderQuantity, maxOrderQuantity);
  const { isAdding, addToCart } = useAddToCart();

  if (isOutOfStock) {
    return (
      <Button variant="secondary" size='md' disabled >
        Нет в наличии
      </Button>
    );
  }

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfRange) return;
    void addToCart(product, quantity);
  };

  const stopRowClickPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="flex w-full items-center gap-2" onClick={stopRowClickPropagation}>
      <Button
  variant="primary"       
  size="md"
  loading={isAdding}
  disabled={isOutOfRange}
  onClick={handleAddToCart}
  className="min-w-0 flex-1 font-medium"
>
  <span className="flex items-center justify-center gap-1.5">
    <ShoppingCart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span className="hidden sm:inline">В корзину</span>
  </span>
</Button>

      <div className="flex h-9 shrink-0 items-center overflow-hidden rounded-md border border-(--neutral-border-medium,#e5e7eb)">
        <IconButton
          variant="tertiary"
          size="s"
          disabled={quantity <= minOrderQuantity}
          onClick={decrease}
          aria-label="Уменьшить количество"
          className="!h-9 !w-7 !rounded-none"
        >
          <Minus className="h-3 w-3" />
        </IconButton>

        <input
          type="number"
          inputMode="numeric"
          value={quantity}
          min={minOrderQuantity}
          max={Number.isFinite(maxOrderQuantity) ? maxOrderQuantity : undefined}
          onChange={(e) => setQuantity(Number(e.target.value) || minOrderQuantity)}
          onClick={stopRowClickPropagation}
          onFocus={stopRowClickPropagation}
          aria-label="Количество товара"
          className="h-9 w-9 border-0 bg-transparent text-center text-sm font-medium tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <IconButton
          variant="tertiary"
          size="s"
          disabled={quantity >= maxOrderQuantity}
          onClick={increase}
          aria-label="Увеличить количество"
          className="!h-9 !w-7 !rounded-none"
        >
          <Plus className="h-3 w-3" />
        </IconButton>
      </div>
    </div>
  );
}
