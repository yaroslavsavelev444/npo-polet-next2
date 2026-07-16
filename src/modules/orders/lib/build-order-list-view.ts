import type {
	Media,
	Order,
	PickupPoint,
	TransportCompany,
} from "@/payload-types";
import type {
	OrderAttachment,
	OrderDetailView,
	OrderListItemView,
	OrderStatusHistoryEntry,
} from "../types";
import { mapOrderLineItems } from "./order-line-item";
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

/** Определяет тип вложения по MIME-типу для выбора способа отображения. */
function resolveAttachmentKind(
	mimeType: string | null,
): OrderAttachment["kind"] {
	if (!mimeType) return "document";
	if (mimeType.startsWith("image/")) return "image";
	if (mimeType === "application/pdf") return "pdf";
	return "document";
}

function mapMediaToAttachment(
	media: Media,
	label: string,
): OrderAttachment | null {
	if (!media.url) return null;
	const mimeType = media.mimeType ?? null;
	const kind = resolveAttachmentKind(mimeType);
	const previewUrl =
		kind === "image"
			? (media.sizes?.thumbnail?.url ?? media.thumbnailURL ?? media.url)
			: null;

	return {
		id: String(media.id),
		label,
		filename: media.filename ?? label,
		url: media.url,
		previewUrl,
		mimeType,
		kind,
		filesize: media.filesize ?? null,
	};
}

/**
 * Собирает вложения, прикреплённые администратором. Сейчас единственный источник —
 * `payment.invoiceFile` (счёт для оплаты по счёту). Функция намеренно построена
 * как список, чтобы новые источники вложений добавлялись без изменения UI.
 */
function collectAttachments(order: Order): OrderAttachment[] {
	const attachments: OrderAttachment[] = [];

	if (isPopulated<Media>(order.payment.invoiceFile)) {
		const invoice = mapMediaToAttachment(
			order.payment.invoiceFile,
			"Счёт на оплату",
		);
		if (invoice) attachments.push(invoice);
	}

	return attachments;
}

function mapStatusHistory(order: Order): OrderStatusHistoryEntry[] {
	return (order.statusHistory ?? []).map((entry) => ({
		status: entry.status,
		changedAt: entry.changedAt ?? null,
		comment: entry.comment ?? null,
	}));
}

export function mapOrderToDetailView(order: Order): OrderDetailView {
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
			transportCompanyPhone: transportCompany?.phone ?? null,
			pickupPointName: pickupPoint?.name ?? null,
			pickupPointAddress: pickupPoint?.address ?? null,
			trackingNumber: order.delivery.trackingNumber ?? null,
			estimatedDelivery: order.delivery.estimatedDelivery ?? null,
			notes: order.delivery.notes ?? null,
		},
		items: mapOrderLineItems(order),
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
			paidAt: order.payment.paidAt ?? null,
		},
		statusHistory: mapStatusHistory(order),
		attachments: collectAttachments(order),
		notes: order.notes ?? null,
		companyInfo: order.companyInfo
			? {
					name: order.companyInfo.name ?? null,
					taxNumber: order.companyInfo.taxNumber ?? null,
					contactPerson: order.companyInfo.contactPerson ?? null,
					legalAddress: order.companyInfo.legalAddress ?? null,
				}
			: null,
	};
}
