import { Package } from "lucide-react";
import { formatPrice } from "@/modules/productCard";
import { Badge } from "@/UI";
import {
  ORDER_STATUS_BADGE_VARIANT,
  ORDER_STATUS_LABELS,
} from "../lib/status.groups";
import type { OrderListItemView } from "../types";

interface Props {
  order: OrderListItemView;
  onSelect: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function OrderItem({ order, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-colors hover:border-[var(--border-light)] hover:bg-[var(--surface-secondary)]"
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <Package className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            Заказ №{order.orderNumber}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {formatDate(order.createdAt)} · {order.totalItems} шт.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge variant={ORDER_STATUS_BADGE_VARIANT[order.status]} size="sm">
          {ORDER_STATUS_LABELS[order.status]}
        </Badge>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {formatPrice(order.total)}
        </span>
      </div>
    </button>
  );
}
