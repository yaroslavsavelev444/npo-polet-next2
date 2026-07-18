const BRAND_COLOR = "#FF4500";

/** Единообразная CTA-кнопка, переиспользуемая во всех шаблонах. */
export function renderButton(label: string, href: string): string {
	return `<div style="margin-top:24px;">
    <a href="${href}" style="display:inline-block;padding:10px 20px;background-color:${BRAND_COLOR};color:#FFFFFF;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">
      ${label}
    </a>
  </div>`;
}

/** Строка вида "Лейбл: значение" для табличных секций письма. */
export function renderRow(label: string, valueHtml: string): string {
	return `<tr>
    <td style="padding:6px 0;color:#71717A;font-size:13px;width:160px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;color:#18181B;font-size:14px;">${valueHtml}</td>
  </tr>`;
}
