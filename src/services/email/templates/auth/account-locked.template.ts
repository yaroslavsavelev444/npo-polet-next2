import type { EmailTemplate, RenderedEmail } from "../../types.ts";
import { formatDate } from "../shared/formatters.ts";
import { renderEmailLayout } from "../shared/layout.ts";

export interface AccountLockedEmailData {
	userName: string;
	lockedUntil: Date;
}

function render(data: AccountLockedEmailData): RenderedEmail {
	const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#B91C1C;">Аккаунт временно заблокирован</h1>
    <p style="margin:0 0 12px;color:#52525B;">Здравствуйте, ${data.userName}!</p>
    <p style="margin:0 0 12px;color:#52525B;">
      Обнаружено множество неудачных попыток входа в ваш аккаунт.
      В целях безопасности вход временно заблокирован до ${formatDate(data.lockedUntil)}.
    </p>
    <p style="margin:0;color:#71717A;font-size:13px;">
      Если это были не вы — рекомендуем сменить пароль сразу после разблокировки.
    </p>
  `;

	return {
		subject: "Ваш аккаунт временно заблокирован",
		html: renderEmailLayout({
			previewText: "Обнаружены подозрительные попытки входа",
			bodyHtml,
		}),
		text: `Аккаунт временно заблокирован до ${formatDate(data.lockedUntil)} из-за множества неудачных попыток входа.`,
	};
}

export const accountLockedEmailTemplate: EmailTemplate<AccountLockedEmailData> =
	{
		id: "account-locked",
		render,
	};
