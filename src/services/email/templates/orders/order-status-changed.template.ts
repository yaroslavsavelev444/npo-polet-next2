import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export type TrackedOrderStatus =
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered";

const STATUS_COPY: Record<
  TrackedOrderStatus,
  { subject: string; message: string }
> = {
  confirmed: {
    subject: "подтверждён",
    message: "Ваш заказ подтверждён и передан в обработку.",
  },
  processing: {
    subject: "в обработке",
    message: "Мы начали собирать ваш заказ.",
  },
  shipped: {
    subject: "отправлен",
    message: "Ваш заказ передан в доставку.",
  },
  delivered: {
    subject: "доставлен",
    message: "Ваш заказ доставлен. Спасибо за покупку!",
  },
};

export interface OrderStatusChangedEmailData {
  recipientName: string;
  orderNumber: string;
  status: TrackedOrderStatus;
  trackingNumber?: string | null;
  orderUrl: string;
}

function render(data: OrderStatusChangedEmailData): RenderedEmail {
  const copy = STATUS_COPY[data.status];

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Заказ №${data.orderNumber} ${copy.subject}</h1>
    <p style="margin:0 0 12px;color:#52525B;">${escapeHtml(data.recipientName)}, ${copy.message}</p>
    ${data.trackingNumber ? `<p style="margin:0 0 20px;color:#52525B;">Трек-номер: <strong>${escapeHtml(data.trackingNumber)}</strong></p>` : ""}
    ${renderButton("Посмотреть заказ", data.orderUrl)}
  `;

  return {
    subject: `Заказ №${data.orderNumber} ${copy.subject}`,
    html: renderEmailLayout({ previewText: copy.message, bodyHtml }),
    text: `Заказ №${data.orderNumber}: ${copy.message} ${data.trackingNumber ? `Трек: ${data.trackingNumber}` : ""} ${data.orderUrl}`,
  };
}

export const orderStatusChangedEmailTemplate: EmailTemplate<OrderStatusChangedEmailData> =
  {
    id: "order-status-changed",
    render,
  };
