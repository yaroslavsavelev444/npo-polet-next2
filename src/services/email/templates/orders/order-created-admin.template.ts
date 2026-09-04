import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { formatRub } from "../shared/formatters.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface OrderCreatedAdminEmailData {
	orderNumber: string;
	recipientName: string;
	/** Номер, по которому покупатель просил связаться по заказу. */
	contactPhone: string;
	/** Чей это номер: «Заказчик» или «Получатель». */
	contactOwnerLabel: string;
	/** Телефон получателя — только если он отличается от номера для связи. */
	recipientPhone?: string;
	itemsCount: number;
	total: number;
	paymentMethodLabel: string;
	adminUrl: string;
}

function render(data: OrderCreatedAdminEmailData): RenderedEmail {
	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Новый заказ на сайте</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${renderRow("Номер заказа", `<strong>${data.orderNumber}</strong>`)}
      ${renderRow("Получатель", escapeHtml(data.recipientName))}
      ${renderRow(
				`Звонить (${escapeHtml(data.contactOwnerLabel.toLowerCase())})`,
				`<a href="tel:${encodeURIComponent(data.contactPhone)}" style="color:#FF4500;text-decoration:none;"><strong>${escapeHtml(data.contactPhone)}</strong></a>`,
			)}
      ${
				// Второй номер показывается, только когда он действительно другой:
				// иначе менеджер видел бы два одинаковых телефона и снова решал,
				// по какому звонить.
				data.recipientPhone
					? renderRow(
							"Телефон получателя",
							`<a href="tel:${encodeURIComponent(data.recipientPhone)}" style="color:#71717A;text-decoration:none;">${escapeHtml(data.recipientPhone)}</a>`,
						)
					: ""
			}
      ${renderRow("Позиций", String(data.itemsCount))}
      ${renderRow("Сумма", formatRub(data.total))}
      ${renderRow("Оплата", escapeHtml(data.paymentMethodLabel))}
    </table>
    ${renderButton("Открыть заказ в админке", data.adminUrl)}
  `;

	return {
		subject: `Новый заказ №${data.orderNumber} — ${formatRub(data.total)}`,
		html: renderEmailLayout({
			previewText: `Новый заказ №${data.orderNumber}`,
			bodyHtml,
		}),
		text: `Новый заказ №${data.orderNumber}. Получатель: ${data.recipientName}. Звонить (${data.contactOwnerLabel.toLowerCase()}): ${data.contactPhone}. Сумма ${formatRub(data.total)}. ${data.adminUrl}`,
	};
}

export const orderCreatedAdminEmailTemplate: EmailTemplate<OrderCreatedAdminEmailData> =
	{
		id: "order-created-admin",
		render,
	};
