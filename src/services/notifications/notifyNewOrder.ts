import type { BasePayload } from "payload";
import type { Order } from "../../../payload-types.ts";
import {
	getOrderContact,
	ORDER_CONTACT_OWNER_LABELS,
} from "../../modules/orders/lib/order-contact.ts";
import { getEmailConfig } from "../email/config.ts";
import {
	emailService,
	orderCreatedAdminEmailTemplate,
	orderCreatedUserEmailTemplate,
} from "../email/index.ts";
import { emailLogger } from "../email/logger.ts";
import { getAdminEmailAddresses } from "../email/recipients/getAdminEmails.ts";
import { getOrderCustomerAddress } from "../email/recipients/getOrderStakeholders.ts";

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

export async function notifyNewOrder(
	order: Order,
	payload: BasePayload,
): Promise<void> {
	const { appUrl } = getEmailConfig();
	const itemsCount = order.items?.length ?? 0;
	// Письмо админам — главный канал, по которому менеджер узнаёт номер для
	// звонка. Номер берётся из того же резолвера, что и заказ, поэтому письмо
	// не может разойтись с карточкой заказа.
	const contact = getOrderContact(order);

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

	const adminSend = getAdminEmailAddresses(payload)
		.then((admins) => {
			if (admins.length === 0) return;
			return emailService.send(
				orderCreatedAdminEmailTemplate,
				{
					orderNumber: order.orderNumber,
					recipientName: order.recipient.fullName,
					contactPhone: contact.phone,
					contactOwnerLabel:
						ORDER_CONTACT_OWNER_LABELS[contact.owner ?? "recipient"],
					recipientPhone:
						contact.recipientPhone && contact.recipientPhone !== contact.phone
							? contact.recipientPhone
							: undefined,
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
