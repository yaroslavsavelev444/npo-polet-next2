import type { Order } from "@/payload-types";
import { getOrderContact, type OrderContactPreference } from "./order-contact";
import { mapOrderLineItems, type OrderLineItem } from "./order-line-item";

export interface OrderSuccessView {
	orderNumber: string;
	status: Order["status"];
	createdAt: string;
	/** Разобранные контакты заказа; `phone` — номер для связи по заказу. */
	contact: {
		phone: string;
		owner: OrderContactPreference | null;
		customerPhone: string;
		recipientPhone: string;
	};
	recipient: {
		fullName: string;
		phone: string;
		email: string;
		contactPerson: string | null;
	};
	payment: { method: Order["payment"]["method"] };
	company: {
		name: string;
		taxNumber: string | null;
		contactPerson: string | null;
	} | null;
	notes: string | null;
	items: OrderLineItem[];
	pricing: { subtotal: number; discount: number; total: number };
	promo?: { code: string; amount: number } | null;
}

export function buildOrderSuccessView(order: Order): OrderSuccessView {
	const company =
		order.companyInfo?.name != null && order.companyInfo.name !== ""
			? {
					name: order.companyInfo.name,
					taxNumber: order.companyInfo.taxNumber ?? null,
					contactPerson: order.companyInfo.contactPerson ?? null,
				}
			: null;

	const contact = getOrderContact(order);

	return {
		orderNumber: order.orderNumber,
		status: order.status,
		createdAt: order.createdAt,
		contact: {
			phone: contact.phone,
			owner: contact.owner,
			customerPhone: contact.customerPhone,
			recipientPhone: contact.recipientPhone,
		},
		recipient: {
			fullName: order.recipient.fullName,
			phone: order.recipient.phone ?? "",
			email: order.recipient.email,
			contactPerson: order.recipient.contactPerson ?? null,
		},
		payment: { method: order.payment.method },
		company,
		notes: order.notes ?? null,
		items: mapOrderLineItems(order),
		promo: order.promoCode?.code
			? {
					code: order.promoCode.code,
					amount: order.pricing.promoDiscountAmount ?? 0,
				}
			: null,
		pricing: {
			subtotal: order.pricing.subtotal,
			discount: order.pricing.discount ?? 0,
			total: order.pricing.total,
		},
	};
}
