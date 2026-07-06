import type { EmailTemplate, RenderedEmail } from "../../types";
import { renderButton } from "../shared/button";
import { formatDate } from "../shared/formatters";
import { renderEmailLayout } from "../shared/layout";

export interface PasswordChangedEmailData {
  userName: string;
  changedAt: Date;
  supportUrl: string;
}

function render(data: PasswordChangedEmailData): RenderedEmail {
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:18px;color:#18181B;">Пароль изменён</h1>
    <p style="margin:0 0 12px;color:#52525B;">Здравствуйте, ${data.userName}!</p>
    <p style="margin:0 0 20px;color:#52525B;">
      Пароль вашего аккаунта был изменён ${formatDate(data.changedAt)}.
      Если это были вы — никаких действий не требуется.
    </p>
    <p style="margin:0;color:#B91C1C;font-size:14px;font-weight:600;">
      Если это были не вы — немедленно свяжитесь с поддержкой.
    </p>
    ${renderButton("Связаться с поддержкой", data.supportUrl)}
  `;

  return {
    subject: "Пароль вашего аккаунта был изменён",
    html: renderEmailLayout({
      previewText: "Пароль вашего аккаунта был изменён",
      bodyHtml,
    }),
    text: `Пароль вашего аккаунта был изменён ${formatDate(data.changedAt)}. Если это были не вы — свяжитесь с поддержкой: ${data.supportUrl}`,
  };
}

export const passwordChangedEmailTemplate: EmailTemplate<PasswordChangedEmailData> =
  {
    id: "password-changed",
    render,
  };
