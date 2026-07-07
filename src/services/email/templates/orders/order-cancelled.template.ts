import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface OrderCancelledEmailData {
  recipientName: string;
  orderNumber: string;
  /** Кто инициировал отмену — влияет на формулировку письма */
  initiatedBy: "customer" | "admin";
  reason?: string | null;
  supportUrl: string;
}

function render(data: OrderCancelledEmailData): RenderedEmail {
  const message =
    data.initiatedBy === "customer"
      ? "Ваш заказ был отменён по вашему запросу."
      : "К сожалению, ваш заказ был отменён нашим менеджером.";

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#B91C1C;">Заказ №${data.orderNumber} отменён</h1>
    <p style="margin:0 0 12px;color:#52525B;">${escapeHtml(data.recipientName)}, ${message}</p>
    ${data.reason ? `<p style="margin:0 0 20px;color:#52525B;">Причина: ${escapeHtml(data.reason)}</p>` : ""}
    <p style="margin:0 0 20px;color:#71717A;font-size:13px;">Если у вас есть вопросы — свяжитесь с поддержкой.</p>
    ${renderButton("Связаться с поддержкой", data.supportUrl)}
  `;

  return {
    subject: `Заказ №${data.orderNumber} отменён`,
    html: renderEmailLayout({ previewText: message, bodyHtml }),
    text: `Заказ №${data.orderNumber} отменён. ${message} ${data.reason ? `Причина: ${data.reason}` : ""}`,
  };
}

export const orderCancelledEmailTemplate: EmailTemplate<OrderCancelledEmailData> =
  {
    id: "order-cancelled",
    render,
  };
