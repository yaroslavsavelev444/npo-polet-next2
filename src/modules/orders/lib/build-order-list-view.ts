import type { Order, PickupPoint, TransportCompany } from "@/payload-types";
import type {
  OrderDetailView,
  OrderItemView,
  OrderListItemView,
} from "../types";
import { isOrderCancellable } from "./status.groups";

function isPopulated<T>(value: number | T | null | undefined): value is T {
  return typeof value === "object" && value !== null;
}

export function mapOrderToListItem(order: Order): OrderListItemView {
  const totalItems = (order.items ?? []).reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  return {
    id: String(order.id),
    orderNumber: order.orderNumber,
    status: order.status,
    createdAt: order.createdAt,
    itemsCount: order.items?.length ?? 0,
    totalItems,
    total: order.pricing.total,
    currency: order.pricing.currency ?? "RUB",
    deliveryMethod: order.delivery.method,
    canCancel: isOrderCancellable(order.status),
  };
}

export function mapOrderToDetailView(order: Order): OrderDetailView {
  const items: OrderItemView[] = (order.items ?? []).map((item) => ({
    productId: String(
      typeof item.product === "object" ? item.product.id : item.product,
    ),
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount: item.discount ?? 0,
    totalPrice: item.totalPrice,
  }));

  const transportCompany = isPopulated<TransportCompany>(
    order.delivery.transportCompany,
  )
    ? order.delivery.transportCompany
    : null;
  const pickupPoint = isPopulated<PickupPoint>(order.delivery.pickupPoint)
    ? order.delivery.pickupPoint
    : null;

  return {
    ...mapOrderToListItem(order),
    recipient: {
      fullName: order.recipient.fullName,
      phone: order.recipient.phone,
      email: order.recipient.email,
      contactPerson: order.recipient.contactPerson ?? null,
    },
    delivery: {
      method: order.delivery.method,
      address: order.delivery.address ?? null,
      transportCompanyName: transportCompany?.name ?? null,
      pickupPointName: pickupPoint?.name ?? null,
      trackingNumber: order.delivery.trackingNumber ?? null,
      estimatedDelivery: order.delivery.estimatedDelivery ?? null,
      notes: order.delivery.notes ?? null,
    },
    items,
    pricing: {
      subtotal: order.pricing.subtotal,
      discount: order.pricing.discount ?? 0,
      shippingCost: order.pricing.shippingCost ?? 0,
      total: order.pricing.total,
      currency: order.pricing.currency ?? "RUB",
    },
    payment: {
      method: order.payment.method,
      status: order.payment.status ?? "pending",
    },
    notes: order.notes ?? null,
    companyInfo: order.companyInfo
      ? {
          name: order.companyInfo.name ?? null,
          taxNumber: order.companyInfo.taxNumber ?? null,
        }
      : null,
  };
}
