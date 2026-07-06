import type { Order } from "@/payload-types";
import {
  emailService,
  orderCreatedAdminEmailTemplate,
  orderCreatedUserEmailTemplate,
} from "@/services/email";
import { getEmailConfig } from "@/services/email/config";
import { emailLogger } from "@/services/email/logger";
import { getAdminEmailAddresses } from "@/services/email/recipients/getAdminEmails";
import { getOrderCustomerAddress } from "@/services/email/recipients/getOrderStakeholders";

const DELIVERY_LABELS: Record<Order["delivery"]["method"], string> = {
  door_to_door: "Курьер до двери",
  pickup_point: "Доставка в ПВЗ",
  self_pickup: "Самовывоз",
};

const PAYMENT_LABELS: Record<Order["payment"]["method"], string> = {
  invoice: "По счёту",
  self_pickup_card: "Картой при самовывозе",
  self_pickup_cash: "Наличными при самовывозе",
};

export async function notifyNewOrder(order: Order): Promise<void> {
  const { appUrl } = getEmailConfig();
  const itemsCount = order.items?.length ?? 0;

  const userSend = emailService
    .send(
      orderCreatedUserEmailTemplate,
      {
        recipientName: order.recipient.fullName,
        orderNumber: order.orderNumber,
        itemsCount,
        total: order.pricing.total,
        deliveryMethodLabel: DELIVERY_LABELS[order.delivery.method],
        orderUrl: `${appUrl}/orders/${order.orderNumber}`,
      },
      { to: getOrderCustomerAddress(order) },
    )
    .catch((error) =>
      emailLogger.error(
        "Не удалось отправить пользователю подтверждение заказа",
        {
          orderNumber: order.orderNumber,
          error: error instanceof Error ? error.message : String(error),
        },
      ),
    );

  const adminSend = getAdminEmailAddresses()
    .then((admins) => {
      if (admins.length === 0) return;
      return emailService.send(
        orderCreatedAdminEmailTemplate,
        {
          orderNumber: order.orderNumber,
          recipientName: order.recipient.fullName,
          recipientPhone: order.recipient.phone,
          itemsCount,
          total: order.pricing.total,
          paymentMethodLabel: PAYMENT_LABELS[order.payment.method],
          adminUrl: `${appUrl}/admin/collections/orders/${order.id}`,
        },
        { to: admins },
      );
    })
    .catch((error) =>
      emailLogger.error("Не удалось уведомить админов о новом заказе", {
        orderNumber: order.orderNumber,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

  await Promise.all([userSend, adminSend]);
}
