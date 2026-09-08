import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { formatDate } from "../shared/formatters.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface ContactRequestAdminEmailData {
	name: string;
	email: string;
	message: string;
	/** ISO-строка момента подтверждения согласия на обработку ПДн. */
	consentAcceptedAt: string;
	consentUrl: string;
	adminUrl: string;
}

/**
 * Письмо персоналу о новом сообщении со страницы контактов.
 *
 * В теле письма — ВСЁ, что отправил посетитель, плюс отметка о согласии на
 * обработку персональных данных. Смысл в том, чтобы на обращение можно было
 * ответить прямо из почты, не заходя в админку: адресату видно имя, адрес,
 * текст целиком и время. Ссылка «Открыть в админке» нужна для смены статуса,
 * а не для чтения.
 *
 * Тема письма содержит имя отправителя: в общем ящике отдела продаж список
 * писем должен читаться без открытия каждого.
 */
function render(data: ContactRequestAdminEmailData): RenderedEmail {
	// Сообщение — многострочный пользовательский текст: экранируем и сохраняем
	// переносы строк.
	const messageHtml = escapeHtml(data.message).replace(/\n/g, "<br/>");
	const consentAt = formatDate(data.consentAcceptedAt);

	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Новое сообщение со страницы «Контакты»</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${renderRow("Имя", `<strong>${escapeHtml(data.name)}</strong>`)}
      ${renderRow("Email", `<a href="mailto:${encodeURIComponent(data.email)}" style="color:#FF4500;text-decoration:none;">${escapeHtml(data.email)}</a>`)}
    </table>
    <div style="margin-top:16px;padding:12px 14px;background:#F4F4F5;border-radius:8px;color:#18181B;font-size:14px;line-height:1.5;">
      ${messageHtml}
    </div>
    <p style="margin:16px 0 0;color:#71717A;font-size:12px;line-height:1.5;">
      Согласие на обработку персональных данных подтверждено ${escapeHtml(consentAt)} (МСК).
      Редакция документа: <a href="${data.consentUrl}" style="color:#71717A;">${escapeHtml(data.consentUrl)}</a>
    </p>
    ${renderButton("Открыть в админке", data.adminUrl)}
  `;

	return {
		subject: `Сообщение с сайта: ${data.name}`,
		html: renderEmailLayout({
			previewText: `Новое сообщение со страницы «Контакты» от ${data.name}`,
			bodyHtml,
		}),
		text: [
			"Новое сообщение со страницы «Контакты».",
			`Имя: ${data.name}`,
			`Email: ${data.email}`,
			"",
			data.message,
			"",
			`Согласие на обработку ПДн подтверждено ${consentAt} (МСК): ${data.consentUrl}`,
			data.adminUrl,
		].join("\n"),
	};
}

export const contactRequestAdminEmailTemplate: EmailTemplate<ContactRequestAdminEmailData> =
	{
		id: "contact-request-admin",
		render,
	};
