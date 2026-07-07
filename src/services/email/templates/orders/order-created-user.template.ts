import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { formatRub } from "../shared/formatters.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface OrderCreatedUserEmailData {
  recipientName: string;
  orderNumber: string;
  itemsCount: number;
  total: number;
  deliveryMethodLabel: string;
  orderUrl: string;
}

function render(data: OrderCreatedUserEmailData): RenderedEmail {
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Спасибо за заказ!</h1>
    <p style="margin:0 0 20px;color:#52525B;">
      ${escapeHtml(data.recipientName)}, ваш заказ <strong>№${data.orderNumber}</strong> принят в обработку.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${renderRow("Товаров", String(data.itemsCount))}
      ${renderRow("Способ получения", escapeHtml(data.deliveryMethodLabel))}
      ${renderRow("Сумма заказа", formatRub(data.total))}
    </table>
    ${renderButton("Посмотреть заказ", data.orderUrl)}
  `;

  return {
    subject: `Заказ №${data.orderNumber} принят`,
    html: renderEmailLayout({
      previewText: `Ваш заказ №${data.orderNumber} принят в обработку`,
      bodyHtml,
    }),
    text: `Заказ №${data.orderNumber} принят. Сумма: ${formatRub(data.total)}. Подробнее: ${data.orderUrl}`,
  };
}

export const orderCreatedUserEmailTemplate: EmailTemplate<OrderCreatedUserEmailData> =
  {
    id: "order-created-user",
    render,
  };
