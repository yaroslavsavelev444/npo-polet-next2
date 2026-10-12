import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface SupportStaffAlertEmailData {
	/**
	 * «new» — начат диалог, а на месте нет ни одного менеджера;
	 * «overdue» — покупатель ждёт ответа дольше срока.
	 */
	kind: "new" | "overdue";
	conversationId: number;
	customerName: string;
	topic: string;
	/** Сколько ждёт, минут — для «overdue». */
	waitingMinutes?: number;
	/** Абсолютная ссылка на диалог в консоли. */
	consoleUrl: string;
}

/**
 * Письмо персоналу о чате поддержки.
 *
 * Текста переписки в письме НЕТ и быть не должно: переписка конфиденциальна
 * и в базе хранится зашифрованной (src/modules/support-chat/server/crypto.ts).
 * Письмо же лежит открытым у почтового провайдера, в пересылках и на
 * телефонах. Поэтому — только кто, о чём, сколько ждёт и ссылка в консоль.
 */
function render(data: SupportStaffAlertEmailData): RenderedEmail {
	const title =
		data.kind === "new"
			? "Новый диалог в чате, а на месте никого"
			: `Покупатель ждёт ответа ${data.waitingMinutes ?? "?"} мин`;
	const subject =
		data.kind === "new"
			? `Чат: новый диалог — ${data.customerName}`
			: `Чат: нет ответа ${data.waitingMinutes ?? ""} мин — ${data.customerName}`;

	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">${escapeHtml(title)}</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${renderRow("Покупатель", `<strong>${escapeHtml(data.customerName)}</strong>`)}
      ${renderRow("Тема", escapeHtml(data.topic))}
      ${renderRow("Диалог", `№${data.conversationId}`)}
    </table>
    <p style="margin:16px 0 0;color:#71717A;font-size:12px;line-height:1.5;">
      Текст переписки в письмо не включается — он доступен только в консоли поддержки.
    </p>
    ${renderButton("Открыть в консоли", data.consoleUrl)}
  `;

	return {
		subject,
		html: renderEmailLayout({ previewText: title, bodyHtml }),
		text: [
			`${title}.`,
			`Покупатель: ${data.customerName}`,
			`Тема: ${data.topic}`,
			`Диалог №${data.conversationId}`,
			"",
			"Текст переписки в письмо не включается — он доступен только в консоли поддержки.",
			data.consoleUrl,
		].join("\n"),
	};
}

export const supportStaffAlertEmailTemplate: EmailTemplate<SupportStaffAlertEmailData> =
	{
		id: "support-staff-alert",
		render,
	};
