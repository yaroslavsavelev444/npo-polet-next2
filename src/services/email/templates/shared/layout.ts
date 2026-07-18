interface EmailLayoutOptions {
	previewText?: string;
	bodyHtml: string;
}

const BRAND_COLOR = "#FF4500"; // совпадает с --primary из theme.css
const COMPANY_NAME = "НПО Полёт";

/**
 * Единая HTML-обёртка для всех писем: инлайн-стили (обязательны для
 * корректного отображения в Gmail/Outlook), табличная вёрстка, брендинг.
 * Конкретные шаблоны передают только `bodyHtml` — визуал остаётся
 * консистентным без дублирования разметки.
 */
export function renderEmailLayout({
	previewText,
	bodyHtml,
}: EmailLayoutOptions): string {
	return `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${COMPANY_NAME}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F5F5F7;font-family:Arial,Helvetica,sans-serif;">
    ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F5F7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
            <tr>
              <td style="background-color:${BRAND_COLOR};padding:20px 32px;">
                <span style="color:#FFFFFF;font-size:18px;font-weight:700;">${COMPANY_NAME}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#18181B;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background-color:#FAFAFB;color:#71717A;font-size:12px;">
                Автоматическое уведомление системы ${COMPANY_NAME}. Отвечать на это письмо не нужно.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
