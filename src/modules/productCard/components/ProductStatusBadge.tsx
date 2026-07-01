/**
 * modules/productCard/components/ProductStatusBadge.tsx
 *
 * Бейдж статуса товара. Для "available" ничего не рендерим — это
 * нормальное состояние и не требует визуального шума (как и в старом UI).
 */

import { Tag } from "@once-ui-system/core";
import type { ProductStatusBadgeProps } from "../types";

const STATUS_CONFIG: Record<
  ProductStatusBadgeProps["status"],
  { label: string; variant: "warning" | "danger" | "neutral" } | null
> = {
  available: null,
  preorder: { label: "Предзаказ", variant: "warning" },
  out_of_stock: { label: "Нет в наличии", variant: "danger" },
  discontinued: { label: "Снят с производства", variant: "neutral" },
};

export function ProductStatusBadge({ status }: ProductStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <Tag size="s" variant={config.variant}>
      {config.label}
    </Tag>
  );
}
