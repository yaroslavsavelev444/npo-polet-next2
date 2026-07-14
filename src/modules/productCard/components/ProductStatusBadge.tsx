/**
 * modules/productCard/components/ProductStatusBadge.tsx
 *
 * Бейдж статуса товара для текстового потока (страница товара). Для
 * "available" ничего не рендерим — это нормальное состояние и не требует
 * визуального шума. В карточке каталога статус показывается поверх
 * изображения (см. ProductImage) — этот компонент туда не подключается.
 */

import { Badge } from "@/UI";
import type { BadgeVariant } from "@/UI";
import type { ProductStatusBadgeProps } from "../types";

const STATUS_CONFIG: Record<
  ProductStatusBadgeProps["status"],
  { label: string; variant: BadgeVariant } | null
> = {
  available: null,
  preorder: { label: "Предзаказ", variant: "warning" },
  out_of_stock: { label: "Нет в наличии", variant: "danger" },
  discontinued: { label: "Снят с производства", variant: "default" },
};

export function ProductStatusBadge({ status }: ProductStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
