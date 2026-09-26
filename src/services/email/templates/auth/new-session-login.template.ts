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
	/**
	 * Устройство добавлено в доверенные — код с него больше не спросят.
	 *
	 * Это письмо теперь уходит только на входы, которым ПОТРЕБОВАЛСЯ код (см.
	 * verifyOtp.ts), то есть на незнакомый браузер или новую сеть. Почти
	 * всегда такой вход заодно делает устройство доверенным, и умолчать об
	 * этом нельзя: до появления механизма письмо сообщало о разовом событии, а
	 * теперь — о правиле, которое будет действовать дальше.
	 */
	deviceRemembered: boolean;
}

function render(data: NewSessionLoginEmailData): RenderedEmail {
	// Заголовок и preview-текст отличаются для запомненного устройства: в
	// списке писем видно именно их, и «Новый вход» там не отличить от десятка
	// прежних уведомлений — а сообщение про доверие требует внимания сейчас,
	// а не когда-нибудь.
	const heading = data.deviceRemembered
		? "Новый вход — устройство запомнено"
		: "Новый вход в аккаунт";

	// Врезка, а не абзац: это единственное в письме, что описывает изменение
	// на будущее, и от перечня «устройство / IP / время» она должна
	// отличаться не только словами.
	const trustNotice = data.deviceRemembered
		? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:20px 0 0;">
      <tr>
        <td style="padding:14px 16px;background:#FFF7ED;border-left:3px solid #FF4500;border-radius:4px;">
          <p style="margin:0 0 6px;color:#18181B;font-size:14px;font-weight:600;">Это устройство добавлено в доверенные</p>
          <p style="margin:0;color:#52525B;font-size:13px;line-height:1.5;">
            При следующих входах с него одноразовый код запрашиваться не будет — достаточно пароля.
            Если вы входили с чужого или общего компьютера, отзовите доверие прямо сейчас.
          </p>
        </td>
      </tr>
    </table>
  `
		: "";

	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 20px;color:#52525B;">Здравствуйте, ${escapeHtml(data.userName)}! Зафиксирован вход в ваш аккаунт с нового устройства.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${renderRow("Устройство", escapeHtml(data.deviceLabel))}
      ${renderRow("IP-адрес", escapeHtml(data.ip))}
      ${renderRow("Дата и время", formatDate(data.loginAt))}
    </table>
    ${trustNotice}
    <p style="margin:20px 0 0;color:#71717A;font-size:13px;">
      Если это были не вы — ${data.deviceRemembered ? "отзовите доверие к устройству, " : ""}смените пароль и завершите все сессии в настройках профиля.
      Смена пароля снимает доверие со всех устройств сразу.
    </p>
    ${renderButton(
			data.deviceRemembered ? "Устройства и доверие" : "Управление сессиями",
			data.sessionsUrl,
		)}
  `;

	return {
		subject: data.deviceRemembered
			? "Новый вход: устройство добавлено в доверенные"
			: "Новый вход в ваш аккаунт",
		html: renderEmailLayout({
			previewText: data.deviceRemembered
				? `«${data.deviceLabel}» запомнено — код с него больше не потребуется`
				: "Зафиксирован вход в ваш аккаунт",
			bodyHtml,
		}),
		text: [
			`${heading}: устройство ${data.deviceLabel}, IP ${data.ip}, ${formatDate(data.loginAt)}.`,
			data.deviceRemembered
				? "Устройство добавлено в доверенные: код при следующих входах с него запрашиваться не будет."
				: "",
			`Управление устройствами: ${data.sessionsUrl}`,
		]
			.filter(Boolean)
			.join(" "),
	};
}

export const newSessionLoginEmailTemplate: EmailTemplate<NewSessionLoginEmailData> =
	{
		id: "new-session-login",
		render,
	};
