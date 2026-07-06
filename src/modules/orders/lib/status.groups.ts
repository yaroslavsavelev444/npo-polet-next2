import type { BadgeVariant } from "@/UI/Badge/Badge.types";
import type { OrderFilterGroup, OrderStatus } from "../types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждён",
  processing: "В обработке",
  shipped: "Отправлен",
  delivered: "Доставлен",
  cancelled: "Отменён",
  refunded: "Возврат",
};

export const ORDER_STATUS_BADGE_VARIANT: Record<OrderStatus, BadgeVariant> = {
  pending: "warning",
  confirmed: "accent",
  processing: "primary",
  shipped: "primary",
  delivered: "success",
  cancelled: "danger",
  refunded: "danger",
};

interface OrderFilterGroupConfig {
  key: OrderFilterGroup;
  label: string;
  statuses: OrderStatus[] | null;
}

/**
 * "Прошедшие" intentionally overlaps with "Завершённые"/"Отменённые" — it's
 * the historical complement of "Текущие", not a fifth disjoint bucket. All
 * four category tabs required by the spec plus "Все заказы".
 */
export const ORDER_FILTER_GROUPS: OrderFilterGroupConfig[] = [
  { key: "all", label: "Все заказы", statuses: null },
  {
    key: "current",
    label: "Текущие",
    statuses: ["pending", "confirmed", "processing", "shipped"],
  },
  { key: "completed", label: "Завершённые", statuses: ["delivered"] },
  {
    key: "cancelled",
    label: "Отменённые",
    statuses: ["cancelled", "refunded"],
  },
  {
    key: "past",
    label: "Прошедшие",
    statuses: ["delivered", "cancelled", "refunded"],
  },
];

export function getStatusesForGroup(
  group: OrderFilterGroup,
): OrderStatus[] | null {
  return ORDER_FILTER_GROUPS.find((g) => g.key === group)?.statuses ?? null;
}

export function isValidFilterGroup(
  value: string | undefined,
): value is OrderFilterGroup {
  return ORDER_FILTER_GROUPS.some((g) => g.key === value);
}

export function isOrderCancellable(status: OrderStatus): boolean {
  return (
    status !== "cancelled" && status !== "refunded" && status !== "delivered"
  );
}
