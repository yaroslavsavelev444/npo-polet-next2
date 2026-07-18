import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { renderButton } from "../shared/button.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface PasswordResetEmailData {
	resetUrl: string;
	expiresInMinutes: number;
}

function render(data: PasswordResetEmailData): RenderedEmail {
	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Восстановление пароля</h1>
    <p style="margin:0 0 20px;color:#52525B;">
      Вы запросили восстановление пароля. Ссылка действительна ${data.expiresInMinutes} мин.
    </p>
    ${renderButton("Установить новый пароль", data.resetUrl)}
    <p style="margin:20px 0 0;color:#71717A;font-size:13px;">
      Если вы не запрашивали восстановление — проигнорируйте это письмо.
    </p>
  `;

	return {
		subject: "Восстановление пароля",
		html: renderEmailLayout({ previewText: "Восстановление пароля", bodyHtml }),
		text: `Вы запросили восстановление пароля. Ссылка действительна ${data.expiresInMinutes} мин.\n${data.resetUrl}\nЕсли вы не запрашивали восстановление — проигнорируйте это письмо.`,
	};
}

export const passwordResetEmailTemplate: EmailTemplate<PasswordResetEmailData> =
	{
		id: "password-reset",
		render,
	};
