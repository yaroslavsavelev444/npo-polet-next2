import type { ProductAvailabilityStatus } from "../types";

export const PRODUCT_STATUS_LABELS: Record<ProductAvailabilityStatus, string> =
  {
    available: "В наличии",
    preorder: "Предзаказ",
    out_of_stock: "Нет в наличии",
    discontinued: "Снят с производства",
  };

export function getProductStatusLabel(
  status: ProductAvailabilityStatus,
): string {
  return PRODUCT_STATUS_LABELS[status];
}
