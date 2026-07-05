// src/modules/cart/components/CartPageClient.tsx
"use client";

import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useCartStore } from "@/shared/store/cart.store";
import { Button } from "@/UI";
import {
  clearCartAction,
  removeFromCartAction,
  updateCartItemQuantityAction,
} from "../actions/cart.actions";
import type { CartView } from "../types";
import { CartEmptyState } from "./CartEmptyState";
import { CartItemRow } from "./CartItemRow";
import { CartSummaryPanel } from "./CartSummaryPanel";
import { DiscountBanner } from "./DiscountBanner";

interface CartPageClientProps {
  initialCart: CartView;
}

function pluralizePositions(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "позиций";
  if (mod10 === 1) return "позиция";
  if (mod10 >= 2 && mod10 <= 4) return "позиции";
  return "позиций";
}

export function CartPageClient({ initialCart }: CartPageClientProps) {
  const [cart, setCart] = useState(initialCart);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [isClearing, startClearing] = useTransition();
  const setItemCount = useCartStore((s) => s.setItemCount);
  const router = useRouter();

  useEffect(() => {
    setItemCount(initialCart.summary.totalItems);
  }, [initialCart, setItemCount]);

  async function handleQuantityChange(productId: string, quantity: number) {
    setPendingProductId(productId);
    const result = await updateCartItemQuantityAction(productId, quantity);
    if (result.success) {
      setCart(result.data);
      setItemCount(result.data.summary.totalItems);
    }
    setPendingProductId(null);
  }

  async function handleRemove(productId: string) {
    setPendingProductId(productId);
    const result = await removeFromCartAction(productId);
    if (result.success) {
      setCart(result.data);
      setItemCount(result.data.summary.totalItems);
    }
    setPendingProductId(null);
  }

  function handleClear() {
    startClearing(async () => {
      const result = await clearCartAction();
      if (result.success) {
        setCart(result.data);
        setItemCount(0);
      }
    });
  }

  function handleCheckout() {
    router.push("/checkout");
  }

  if (cart.items.length === 0) {
    return <CartEmptyState />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">
            <ShoppingCart className="h-6 w-6" />
            Корзина
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {cart.summary.itemsCount}{" "}
            {pluralizePositions(cart.summary.itemsCount)},{" "}
            {cart.summary.totalItems} шт.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          loading={isClearing}
          disabled={isClearing}
        >
          Очистить корзину
        </Button>
      </div>

      <DiscountBanner discounts={cart.discounts} />

      {!cart.validation.isValid && (
        <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Некоторые товары заказаны в количестве меньше минимального:
          </p>
          <ul className="mt-2 space-y-1">
            {cart.validation.issues.map((issue) => (
              <li
                key={issue.productId}
                className="text-sm text-[var(--text-secondary)]"
              >
                «{issue.productTitle}» — {issue.currentQuantity} шт. (минимум{" "}
                {issue.minOrderQuantity} шт.)
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          {cart.items.map((item) => (
            <CartItemRow
              key={item.product.id}
              item={item}
              isPending={pendingProductId === item.product.id}
              onQuantityChange={(quantity) =>
                handleQuantityChange(item.product.id, quantity)
              }
              onRemove={() => handleRemove(item.product.id)}
            />
          ))}
        </div>

        <div className="lg:col-span-1">
          <CartSummaryPanel
            summary={cart.summary}
            isValid={cart.validation.isValid}
            onCheckout={handleCheckout}
          />
        </div>
      </div>
    </div>
  );
}
