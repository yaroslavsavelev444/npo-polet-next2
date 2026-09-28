import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { formatDate } from "../shared/formatters.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface ContactRequestAdminEmailData {
	/**
	 * «general» — форма на /contacts, «print3d» — заявка на 3D-печать с
	 * главной, «product» — заявка на недоступный товар.
	 */
	topic: "general" | "print3d" | "product";
	name: string;
	email?: string;
	phone?: string;
	message?: string;
	/** Заявка на товар: название, абсолютная ссылка, количество. */
	product?: { title: string; url: string; quantity: number };
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
 * Тема письма содержит тип обращения и имя отправителя: в общем ящике отдела
 * продаж список писем должен читаться без открытия каждого, а заявку на
 * 3D-печать — отличаться от вопроса о продукции уже в списке.
 */
const HEADINGS = {
	general: {
		title: "Новое сообщение со страницы «Контакты»",
		subject: "Сообщение с сайта",
	},
	print3d: {
		title: "Новая заявка на 3D-печать",
		subject: "Заявка на 3D-печать",
	},
	product: {
		title: "Новая заявка на товар",
		subject: "Заявка на товар",
	},
} as const;

function render(data: ContactRequestAdminEmailData): RenderedEmail {
	// Сообщение — многострочный пользовательский текст: экранируем и сохраняем
	// переносы строк.
	const messageHtml = data.message
		? escapeHtml(data.message).replace(/\n/g, "<br/>")
		: "";
	const consentAt = formatDate(data.consentAcceptedAt);
	const heading = HEADINGS[data.topic];
	const phoneRow = data.phone
		? renderRow(
				"Телефон",
				`<a href="tel:${encodeURIComponent(data.phone.replace(/[^\d+]/g, ""))}" style="color:#FF4500;text-decoration:none;">${escapeHtml(data.phone)}</a>`,
			)
		: "";

	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">${heading.title}</h1>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${renderRow("Имя", `<strong>${escapeHtml(data.name)}</strong>`)}
      ${data.email ? renderRow("Email", `<a href="mailto:${encodeURIComponent(data.email)}" style="color:#FF4500;text-decoration:none;">${escapeHtml(data.email)}</a>`) : ""}
      ${phoneRow}
      ${data.product ? renderRow("Товар", `<a href="${data.product.url}" style="color:#FF4500;text-decoration:none;">${escapeHtml(data.product.title)}</a>`) : ""}
      ${data.product ? renderRow("Количество", `${data.product.quantity} шт.`) : ""}
    </table>
    ${
			messageHtml
				? `<div style="margin-top:16px;padding:12px 14px;background:#F4F4F5;border-radius:8px;color:#18181B;font-size:14px;line-height:1.5;">
      ${messageHtml}
    </div>`
				: ""
		}
    <p style="margin:16px 0 0;color:#71717A;font-size:12px;line-height:1.5;">
      Согласие на обработку персональных данных подтверждено ${escapeHtml(consentAt)} (МСК).
      Редакция документа: <a href="${data.consentUrl}" style="color:#71717A;">${escapeHtml(data.consentUrl)}</a>
    </p>
    ${renderButton("Открыть в админке", data.adminUrl)}
  `;

	return {
		subject: `${heading.subject}: ${data.name}`,
		html: renderEmailLayout({
			previewText: `${heading.title} от ${data.name}`,
			bodyHtml,
		}),
		text: [
			`${heading.title}.`,
			`Имя: ${data.name}`,
			...(data.email ? [`Email: ${data.email}`] : []),
			...(data.phone ? [`Телефон: ${data.phone}`] : []),
			...(data.product
				? [
						`Товар: ${data.product.title} — ${data.product.url}`,
						`Количество: ${data.product.quantity} шт.`,
					]
				: []),
			"",
			...(data.message ? [data.message, ""] : []),
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
