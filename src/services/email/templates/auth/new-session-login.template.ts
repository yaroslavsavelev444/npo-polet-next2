import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton, renderRow } from "../shared/button.ts";
import { escapeHtml } from "../shared/escapeHtml.ts";
import { formatDate } from "../shared/formatters.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface NewSessionLoginEmailData {
	userName: string;
	deviceLabel: string;
	ip: string;
	loginAt: Date;
	sessionsUrl: string;
}

function render(data: NewSessionLoginEmailData): RenderedEmail {
	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Новый вход в аккаунт</h1>
    <p style="margin:0 0 20px;color:#52525B;">Здравствуйте, ${escapeHtml(data.userName)}! Зафиксирован вход в ваш аккаунт.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${renderRow("Устройство", escapeHtml(data.deviceLabel))}
      ${renderRow("IP-адрес", escapeHtml(data.ip))}
      ${renderRow("Дата и время", formatDate(data.loginAt))}
    </table>
    <p style="margin:20px 0 0;color:#71717A;font-size:13px;">
      Если это были не вы — смените пароль и завершите все сессии в настройках профиля.
    </p>
    ${renderButton("Управление сессиями", data.sessionsUrl)}
  `;

	return {
		subject: "Новый вход в ваш аккаунт",
		html: renderEmailLayout({
			previewText: "Зафиксирован вход в ваш аккаунт",
			bodyHtml,
		}),
		text: `Новый вход: устройство ${data.deviceLabel}, IP ${data.ip}, ${formatDate(data.loginAt)}. Управление сессиями: ${data.sessionsUrl}`,
	};
}

export const newSessionLoginEmailTemplate: EmailTemplate<NewSessionLoginEmailData> =
	{
		id: "new-session-login",
		render,
	};
