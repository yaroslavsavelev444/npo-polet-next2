import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { renderEmailLayout } from "../shared/layout.ts";

const TYPE_LABELS: Record<string, string> = {
	bug: "Ошибка / баг",
	improvement: "Предложение по улучшению",
	question: "Вопрос",
	order_issue: "Проблема с заказом",
	account_issue: "Проблема с аккаунтом",
	other: "Другое",
};

export interface FeedbackCreatedAdminEmailData {
	feedbackType: string;
	title: string;
	description: string;
	userEmail: string;
	adminUrl: string;
}

function render(data: FeedbackCreatedAdminEmailData): RenderedEmail {
	const typeLabel = TYPE_LABELS[data.feedbackType] ?? data.feedbackType;
	// Описание — многострочный пользовательский текст: экранируем и сохраняем
	// переносы строк.
	const descriptionHtml = escapeHtml(data.description).replace(/\n/g, "<br/>");

	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Новое обращение обратной связи</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${renderRow("Тип", escapeHtml(typeLabel))}
      ${renderRow("Заголовок", `<strong>${escapeHtml(data.title)}</strong>`)}
      ${renderRow("Email для связи", `<a href="mailto:${encodeURIComponent(data.userEmail)}" style="color:#FF4500;text-decoration:none;">${escapeHtml(data.userEmail)}</a>`)}
    </table>
    <div style="margin-top:16px;padding:12px 14px;background:#F4F4F5;border-radius:8px;color:#18181B;font-size:14px;line-height:1.5;">
      ${descriptionHtml}
    </div>
    ${renderButton("Открыть в админке", data.adminUrl)}
  `;

	return {
		subject: `Новое обращение: ${typeLabel} — ${data.title}`,
		html: renderEmailLayout({
			previewText: `Новое обращение обратной связи: ${data.title}`,
			bodyHtml,
		}),
		text: `Новое обращение обратной связи.\nТип: ${typeLabel}\nЗаголовок: ${data.title}\nEmail: ${data.userEmail}\n\n${data.description}\n\n${data.adminUrl}`,
	};
}

export const feedbackCreatedAdminEmailTemplate: EmailTemplate<FeedbackCreatedAdminEmailData> =
	{
		id: "feedback-created-admin",
		render,
	};
