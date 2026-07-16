import type { Order } from "@/payload-types";
import { mapOrderLineItems, type OrderLineItem } from "./order-line-item";

export interface OrderSuccessView {
	orderNumber: string;
	status: Order["status"];
	createdAt: string;
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

	return {
		orderNumber: order.orderNumber,
		status: order.status,
		createdAt: order.createdAt,
		recipient: {
			fullName: order.recipient.fullName,
			phone: order.recipient.phone,
			email: order.recipient.email,
			contactPerson: order.recipient.contactPerson ?? null,
		},
		payment: { method: order.payment.method },
		company,
		notes: order.notes ?? null,
		items: mapOrderLineItems(order),
		pricing: {
			subtotal: order.pricing.subtotal,
			discount: order.pricing.discount ?? 0,
			total: order.pricing.total,
		},
	};
}
