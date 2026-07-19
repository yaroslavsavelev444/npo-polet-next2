import type { Order } from "@/payload-types";
import type { OrderLineItem } from "./lib/order-line-item";

export type OrderStatus = Order["status"];

/** Вложение к заказу (медиа/документ, прикреплённый администратором). */
export interface OrderAttachment {
	id: string;
	/** Назначение вложения, например «Счёт на оплату». */
	label: string;
	filename: string;
	url: string;
	/** Превью для изображений; `null` для документов. */
	previewUrl: string | null;
	mimeType: string | null;
	kind: "image" | "pdf" | "document";
	filesize: number | null;
}

/** Запись истории изменения статуса заказа. */
export interface OrderStatusHistoryEntry {
	status: OrderStatus;
	changedAt: string | null;
	comment: string | null;
}

export type OrderFilterGroup =
	| "all"
	| "current"
	| "completed"
	| "cancelled"
	| "past";

export interface OrderListItemView {
	id: string;
	orderNumber: string;
	status: OrderStatus;
	createdAt: string;
	itemsCount: number;
	totalItems: number;
	total: number;
	currency: string;
	deliveryMethod: Order["delivery"]["method"];
	canCancel: boolean;
}

export interface OrderDetailView extends OrderListItemView {
	recipient: {
		fullName: string;
		phone: string;
		email: string;
		contactPerson?: string | null;
	};
	delivery: {
		method: Order["delivery"]["method"];
		address?: {
			city?: string | null;
			street?: string | null;
			house?: string | null;
			apartment?: string | null;
			postalCode?: string | null;
			country?: string | null;
		} | null;
		transportCompanyName?: string | null;
		pickupPointName?: string | null;
		transportCompanyPhone?: string | null;
		pickupPointAddress?: string | null;
		trackingNumber?: string | null;
		estimatedDelivery?: string | null;
		notes?: string | null;
	};
	items: OrderLineItem[];
	pricing: {
		subtotal: number;
		discount: number;
		shippingCost: number;
		total: number;
		currency: string;
	};
	payment: {
		method: Order["payment"]["method"];
		status: NonNullable<Order["payment"]["status"]>;
		paidAt?: string | null;
	};
	statusHistory: OrderStatusHistoryEntry[];
	attachments: OrderAttachment[];
	notes?: string | null;
	companyInfo?: {
		name?: string | null;
		taxNumber?: string | null;
		contactPerson?: string | null;
		legalAddress?: string | null;
	} | null;
}

export interface OrdersListResult {
	orders: OrderListItemView[];
	totalDocs: number;
	totalPages: number;
	page: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export type CancelOrderErrorCode =
	| "AUTH_REQUIRED"
	| "NOT_FOUND"
	| "NOT_CANCELLABLE"
	| "VALIDATION_ERROR"
	| "UNKNOWN";

export type CancelOrderResult =
	| { success: true; data: { status: OrderStatus } }
	| { success: false; error: CancelOrderErrorCode; message: string };

export type OrderDetailResult =
	| { success: true; data: OrderDetailView }
	| { success: false; message: string };
