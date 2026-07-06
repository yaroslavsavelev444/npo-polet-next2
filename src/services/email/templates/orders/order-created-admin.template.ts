import type { EmailTemplate, RenderedEmail } from "../../types";
import { renderButton, renderRow } from "../shared/button";
import { escapeHtml } from "../shared/escapeHtml";
import { formatRub } from "../shared/formatters";
import { renderEmailLayout } from "../shared/layout";

export interface OrderCreatedAdminEmailData {
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
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
      ${renderRow("Клиент", escapeHtml(data.recipientName))}
      ${renderRow("Телефон", `<a href="tel:${encodeURIComponent(data.recipientPhone)}" style="color:#FF4500;text-decoration:none;">${escapeHtml(data.recipientPhone)}</a>`)}
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
    text: `Новый заказ №${data.orderNumber} от ${data.recipientName}, ${data.recipientPhone}, сумма ${formatRub(data.total)}. ${data.adminUrl}`,
  };
}

export const orderCreatedAdminEmailTemplate: EmailTemplate<OrderCreatedAdminEmailData> =
  {
    id: "order-created-admin",
    render,
  };
