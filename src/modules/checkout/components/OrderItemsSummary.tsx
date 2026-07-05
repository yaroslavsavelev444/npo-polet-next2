import Image from "next/image";
import type { CartItemView } from "@/modules/cart";
import { formatPrice } from "@/modules/productCard";

export function OrderItemsSummary({ items }: { items: CartItemView[] }) {
  return (
    <div className="border-radius: var(--radius-lg) border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
        Товары ({items.length})
      </h2>
      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const image = item.product.images[0];
          return (
            <div key={item.product.id} className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-secondary)]">
                {image && (
                  <Image
                    src={image.url}
                    alt={image.alt || item.product.title}
                    fill
                    sizes="56px"
                    className="object-contain p-1"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {item.product.title}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {item.quantity} шт. × {formatPrice(item.unitFinalPrice)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                {formatPrice(item.subtotal)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
