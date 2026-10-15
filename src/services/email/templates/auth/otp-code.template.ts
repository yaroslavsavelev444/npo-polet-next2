import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export type OtpEmailPurpose =
	| "email_verify"
	| "login_2fa"
	| "link_oauth"
	| "account_delete";

export interface OtpEmailData {
	purpose: OtpEmailPurpose;
	code: string;
	expiresInMinutes: number;
}

const COPY: Record<
	OtpEmailPurpose,
	{ subject: string; heading: string; description: string }
> = {
	email_verify: {
		subject: "Подтверждение email",
		heading: "Подтвердите ваш email",
		description: "Для завершения регистрации введите код:",
	},
	login_2fa: {
		subject: "Код входа",
		heading: "Код для входа",
		description: "Для входа в аккаунт введите код:",
	},
	// Письмо приходит владельцу аккаунта, когда кто-то пытается войти в него
	// через Яндекс ID с той же почтой. Текст обязан прямо назвать действие:
	// если это не он, по нему он и поймёт, что вводить код нельзя.
	link_oauth: {
		subject: "Привязка Яндекс ID",
		heading: "Подтвердите вход через Яндекс ID",
		description:
			"Чтобы привязать Яндекс ID к вашему аккаунту и войти, введите код. Если вы не входили через Яндекс ID — никому не сообщайте код:",
	},
	// Удаление аккаунта без пароля (вход только через Яндекс ID): код
	// заменяет повторный ввод пароля. Необратимое действие — текст прямо
	// говорит, что подтверждается.
	account_delete: {
		subject: "Удаление аккаунта",
		heading: "Подтвердите удаление аккаунта",
		description:
			"Чтобы создать заявку на удаление аккаунта, введите код. Если вы этого не запрашивали — никому не сообщайте код и смените пароль:",
	},
};

function render(data: OtpEmailData): RenderedEmail {
	const copy = COPY[data.purpose];

	const bodyHtml = `
    <h1 style="margin:0 0 8px;font-size:20px;color:#18181B;">${copy.heading}</h1>
    <p style="margin:0 0 28px;color:#52525B;">${copy.description}</p>
    <div style="background:#F4F5F7;border-radius:8px;padding:24px;text-align:center;letter-spacing:12px;font-size:32px;font-weight:700;color:#18181B;font-family:monospace;margin-bottom:24px;">
      ${data.code}
    </div>
    <p style="margin:0;color:#71717A;font-size:13px;line-height:1.5;">
      Код действителен ${data.expiresInMinutes} минут.<br/>
      Если вы не запрашивали код — просто проигнорируйте это письмо.
    </p>
  `;

	return {
		subject: `${copy.subject} — ${data.code}`,
		html: renderEmailLayout({ previewText: copy.description, bodyHtml }),
		text: `${copy.heading}\n${copy.description} ${data.code}\nКод действителен ${data.expiresInMinutes} минут.`,
	};
}

export const otpEmailTemplate: EmailTemplate<OtpEmailData> = {
	id: "otp-code",
	render,
};
