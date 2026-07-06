import type { Order } from "@/payload-types";
import {
  emailService,
  orderCancelledEmailTemplate,
  orderStatusChangedEmailTemplate,
} from "@/services/email";
import { getEmailConfig } from "@/services/email/config";
import { emailLogger } from "@/services/email/logger";
import { getOrderCustomerAddress } from "@/services/email/recipients/getOrderStakeholders";
import type { TrackedOrderStatus } from "@/services/email/templates/orders/order-status-changed.template";

const TRACKED_STATUSES: TrackedOrderStatus[] = [
  "confirmed",
  "processing",
  "shipped",
  "delivered",
];

function isTrackedStatus(
  status: Order["status"],
): status is TrackedOrderStatus {
  return (TRACKED_STATUSES as string[]).includes(status);
}

export async function notifyOrderStatusChanged(order: Order): Promise<void> {
  if (!isTrackedStatus(order.status)) return;

  const { appUrl } = getEmailConfig();
  try {
    await emailService.send(
      orderStatusChangedEmailTemplate,
      {
        recipientName: order.recipient.fullName,
        orderNumber: order.orderNumber,
        status: order.status,
        trackingNumber: order.delivery.trackingNumber,
        orderUrl: `${appUrl}/orders/${order.orderNumber}`,
      },
      { to: getOrderCustomerAddress(order) },
    );
  } catch (error) {
    emailLogger.error("Не удалось уведомить об изменении статуса заказа", {
      orderNumber: order.orderNumber,
      status: order.status,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * initiatedBy определяется вызывающим кодом (hook), а не самим сервисом —
 * сервис не должен знать про req.user, это ответственность точки интеграции.
 */
export async function notifyOrderCancelled(
  order: Order,
  initiatedBy: "customer" | "admin",
): Promise<void> {
  const { appUrl } = getEmailConfig();
  try {
    await emailService.send(
      orderCancelledEmailTemplate,
      {
        recipientName: order.recipient.fullName,
        orderNumber: order.orderNumber,
        initiatedBy,
        reason: order.internalNotes ?? null,
        supportUrl: `${appUrl}/contacts`,
      },
      { to: getOrderCustomerAddress(order) },
    );
  } catch (error) {
    emailLogger.error("Не удалось уведомить об отмене заказа", {
      orderNumber: order.orderNumber,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
